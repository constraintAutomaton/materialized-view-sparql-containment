import { describe, expect, it } from "vitest";
import { translate } from 'sparqlalgebrajs';
import { hasPropertyPath, normalizeQueries, hasProjection, queryVariables } from '../lib/query';

describe(hasPropertyPath.name, () => {
    it('should return false given a query with no property path', () => {
        const query = `
        PREFIX owl: <http://www.w3.org/2002/07/owl#>
        PREFIX rh: <http://rdf.rhea-db.org/>
        PREFIX up: <http://purl.uniprot.org/core/>
        SELECT ?swisslipid  ?organism {
        ?swisslipid owl:equivalentClass ?chebi .
        ?catalyticActivityAnnotation up:catalyticActivity ?rhea .
        ?protein up:annotation ?catalyticActivityAnnotation ;
                up:organism ?organism .
        }`;
        expect(hasPropertyPath(translate(query))).toBe(false);
    });

    it('should return true given a query with a property path', () => {
        const query = `
        PREFIX owl: <http://www.w3.org/2002/07/owl#>
        PREFIX rh: <http://rdf.rhea-db.org/>
        PREFIX up: <http://purl.uniprot.org/core/>
        SELECT ?swisslipid  ?organism {
        ?swisslipid owl:equivalentClass ?chebi .
        ?catalyticActivityAnnotation up:catalyticActivity|up:catalyticActivity2 ?rhea .
        ?protein up:annotation ?catalyticActivityAnnotation ;
                up:organism ?organism .
        }`;
        expect(hasPropertyPath(translate(query))).toBe(true);
    });

    it('should return true given a query with multiple property paths', () => {
        const query = `
        PREFIX owl: <http://www.w3.org/2002/07/owl#>
        PREFIX rh: <http://rdf.rhea-db.org/>
        PREFIX up: <http://purl.uniprot.org/core/>
        SELECT ?swisslipid  ?organism {
        ?swisslipid owl:equivalentClass ?chebi .
        SERVICE <https://sparql.rhea-db.org/sparql> {
            ?rhea rh:side/rh:contains/rh:compound ?compound .
            ?compound (rh:chebi|(rh:reactivePart/rh:chebi)|(rh:underlyingChebi/rh:chebi)) ?metabolite .
            ?compound2 (rh:chebi|(rh:reactivePart/rh:chebi)|(rh:underlyingChebi/rh:chebi)) ?metabolite .
        }
        SERVICE <https://sparql.uniprot.org/sparql> {
            ?catalyticActivityAnnotation up:catalyticActivity/up:catalyzedReaction ?rhea .
            ?protein up:annotation ?catalyticActivityAnnotation ;
                    up:organism ?organism .
        }
        }`;
        expect(hasPropertyPath(translate(query))).toBe(true);
    });
});

describe(normalizeQueries.name, () => {
    it("should have the same queries given 2 identical queries", () => {
        const queryString = `
        PREFIX owl: <http://www.w3.org/2002/07/owl#>
        PREFIX rh: <http://rdf.rhea-db.org/>
        PREFIX up: <http://purl.uniprot.org/core/>
        SELECT ?swisslipid  ?organism {
        ?swisslipid owl:equivalentClass ?chebi .
        ?catalyticActivityAnnotation up:catalyticActivity ?rhea .
        ?protein up:annotation ?catalyticActivityAnnotation ;
                up:organism ?organism .
        }`;
        const query1 = translate(queryString);
        const query2 = translate(queryString);
        const resp = normalizeQueries(query1, query2);
        expect(resp.mapping).toStrictEqual(new Map([
            ["swisslipid", "swisslipid"],
            ["organism", "organism"],
            ["chebi", "chebi"],
            ["catalyticActivityAnnotation", "catalyticActivityAnnotation"],
            ["rhea", "rhea"],
            ["protein", "protein"]
        ]));

        expect(resp.queries.super_query).toStrictEqual(query1);
        expect(resp.queries.sub_query).toStrictEqual(query2);
    });

    it("should rewrite the query given 2 identical queries with different variable names", () => {

        const query1 = translate(`
        PREFIX owl: <http://www.w3.org/2002/07/owl#>
        PREFIX rh: <http://rdf.rhea-db.org/>
        PREFIX up: <http://purl.uniprot.org/core/>
        SELECT ?swisslipid  ?organism {
        ?swisslipid owl:equivalentClass ?chebi .
        ?catalyticActivityAnnotation up:catalyticActivity ?rhea .
        ?protein up:annotation ?catalyticActivityAnnotation ;
                up:organism ?organism .
        }`);
        const query2 = translate(`
        PREFIX owl: <http://www.w3.org/2002/07/owl#>
        PREFIX rh: <http://rdf.rhea-db.org/>
        PREFIX up: <http://purl.uniprot.org/core/>
        SELECT ?swisslipid1  ?organism1 {
        ?swisslipid1 owl:equivalentClass ?chebi1 .
        ?catalyticActivityAnnotation1 up:catalyticActivity ?rhea1 .
        ?protein1 up:annotation ?catalyticActivityAnnotation1 ;
                up:organism ?organism1 .
        }`);
        const resp = normalizeQueries(query1, query2);
        expect(resp.mapping).toStrictEqual(new Map([
            ["swisslipid1", "swisslipid"],
            ["organism1", "organism"],
            ["chebi1", "chebi"],
            ["catalyticActivityAnnotation1", "catalyticActivityAnnotation"],
            ["rhea1", "rhea"],
            ["protein1", "protein"]
        ]));

        expect(resp.queries.super_query).toStrictEqual(query1);
        expect(resp.queries.sub_query).toStrictEqual(query1);
    });

    it("should rewrite a query with less variables", () => {

        const query1 = translate(`
        PREFIX owl: <http://www.w3.org/2002/07/owl#>
        PREFIX rh: <http://rdf.rhea-db.org/>
        PREFIX up: <http://purl.uniprot.org/core/>
        SELECT ?swisslipid  ?organism {
        ?swisslipid owl:equivalentClass ?chebi .
        ?catalyticActivityAnnotation up:catalyticActivity ?rhea .
        ?protein up:annotation ?catalyticActivityAnnotation ;
                up:organism ?organism .
        }`);
        const query2 = translate(`
        PREFIX owl: <http://www.w3.org/2002/07/owl#>
        PREFIX rh: <http://rdf.rhea-db.org/>
        PREFIX up: <http://purl.uniprot.org/core/>
        SELECT * WHERE {
        ?swisslipid1 owl:equivalentClass ?chebi1 .
        ?catalyticActivityAnnotation1 up:catalyticActivity ?rhea1 .
        }`);
        const resp = normalizeQueries(query1, query2);
        expect(resp.mapping).toStrictEqual(new Map([
            ["swisslipid1", "swisslipid"],
            ["chebi1", "chebi"],
            ["catalyticActivityAnnotation1", "catalyticActivityAnnotation"],
            ["rhea1", "rhea"],
        ]));

        const expectedQuery = translate(`
            PREFIX owl: <http://www.w3.org/2002/07/owl#>
            PREFIX rh: <http://rdf.rhea-db.org/>
            PREFIX up: <http://purl.uniprot.org/core/>
            SELECT * WHERE {
            ?swisslipid owl:equivalentClass ?chebi .
            ?catalyticActivityAnnotation up:catalyticActivity ?rhea .
            }`)
        expect(resp.queries.super_query).toStrictEqual(query1);
        expect(resp.queries.sub_query).toStrictEqual(expectedQuery);
    });

    it("should not rewrite queries that have nothing in common", () => {

        const query1 = translate(`
        PREFIX owl: <http://www.w3.org/2002/07/owl#>
        PREFIX rh: <http://rdf.rhea-db.org/>
        PREFIX up: <http://purl.uniprot.org/core/>
        SELECT ?swisslipid  ?organism {
        ?swisslipid owl:equivalentClass ?chebi .
        ?catalyticActivityAnnotation up:catalyticActivity ?rhea .
        ?protein up:annotation ?catalyticActivityAnnotation ;
                up:organism ?organism .
        }`);
        const query2 = translate(`
        PREFIX owl: <http://www.w3.org/2002/07/owl2#>
        PREFIX rh: <http://rdf.rhea-db.org2/>
        PREFIX up: <http://purl.uniprot.org/core2/>
        SELECT * WHERE {
        ?s owl:equivalentClass2 ?o
        }`);
        const resp = normalizeQueries(query1, query2);
        expect(resp.mapping).toStrictEqual(new Map([]));

        expect(resp.queries.super_query).toStrictEqual(query1);
        expect(resp.queries.sub_query).toStrictEqual(query2);
    });

    it("should rewrite the query given it has different variables that cannot be rewritten", () => {

        const query1 = translate(`
        PREFIX owl: <http://www.w3.org/2002/07/owl#>
        PREFIX rh: <http://rdf.rhea-db.org/>
        PREFIX up: <http://purl.uniprot.org/core/>
        SELECT ?swisslipid  ?organism {
        ?swisslipid owl:equivalentClass ?chebi .
        ?catalyticActivityAnnotation up:catalyticActivity ?rhea .
        ?protein up:annotation ?catalyticActivityAnnotation ;
                up:organism ?organism .
        }`);
        const query2 = translate(`
        PREFIX owl: <http://www.w3.org/2002/07/owl#>
        PREFIX rh: <http://rdf.rhea-db.org/>
        PREFIX up: <http://purl.uniprot.org/core/>
        SELECT ?swisslipid1  ?organism1 {
        ?swisslipid1 owl:equivalentClass ?chebi1 .
        ?catalyticActivityAnnotation1 up:catalyticActivity ?rhea1 .
        ?protein1 up:annotation ?catalyticActivityAnnotation1 ;
                up:organism ?organism1 ;
                owl:equivalentClass ?v0 ;
                <http://www.example.com#foo> ?v1 .
        ?v2 <http://www.example.com#foo2>  ?v3 .
        }`);
        const resp = normalizeQueries(query1, query2);
        expect(resp.mapping).toStrictEqual(new Map([
            ["swisslipid1", "swisslipid"],
            ["organism1", "organism"],
            ["chebi1", "chebi"],
            ["catalyticActivityAnnotation1", "catalyticActivityAnnotation"],
            ["rhea1", "rhea"],
            ["protein1", "protein"]
        ]));

        const expectedQuery = translate(`
            PREFIX owl: <http://www.w3.org/2002/07/owl#>
            PREFIX rh: <http://rdf.rhea-db.org/>
            PREFIX up: <http://purl.uniprot.org/core/>
            SELECT ?swisslipid  ?organism {
            ?swisslipid owl:equivalentClass ?chebi .
            ?catalyticActivityAnnotation up:catalyticActivity ?rhea .
            ?protein up:annotation ?catalyticActivityAnnotation ;
                    up:organism ?organism ;
                    owl:equivalentClass ?v0 ;
                    <http://www.example.com#foo> ?v1 .
            ?v2 <http://www.example.com#foo2>  ?v3 .
            }`)
        expect(resp.queries.super_query).toStrictEqual(query1);
        expect(resp.queries.sub_query).toStrictEqual(expectedQuery);
    });
});

describe(hasProjection.name, () => {
    it("given a query with projection should return true", () => {
        const query = `SELECT ?s {?s ?p ?o}`;
        const algebra = translate(query);
        expect(hasProjection(algebra)).toBe(true);
    });

    it("given a query with no projection should return false", () => {
        const query = `SELECT * {?s ?p ?o}`;
        const algebra = translate(query);
        expect(hasProjection(algebra)).toBe(false);
    });

    it("given a query with no projection defined manually should return false", () => {
        const query = `SELECT ?s ?p ?o {?s ?p ?o}`;
        const algebra = translate(query);
        expect(hasProjection(algebra)).toBe(false);
    });
});

describe(queryVariables.name, () => {
    it("should return every variables of a query", () => {
        const query = `SELECT * WHERE {?s ?p ?o}`;
        const variables = queryVariables(translate(query));

        expect(new Set(variables)).toStrictEqual(new Set(["s", "p", "o"]));
    });

    it("should return no variables of a query with no variables", () => {
        const query = `SELECT * WHERE {<http://example.com#s> a <http://example.com#o>}`;
        const variables = queryVariables(translate(query));

        expect(new Set(variables)).toStrictEqual(new Set([]));
    });

    it("should return the variables of a complex query", () => {
        const query = `
        PREFIX owl: <http://www.w3.org/2002/07/owl#>
        PREFIX rh: <http://rdf.rhea-db.org/>
        PREFIX up: <http://purl.uniprot.org/core/>
        SELECT ?swisslipid  ?organism {
        ?swisslipid owl:equivalentClass ?chebi .
        SERVICE <https://sparql.rhea-db.org/sparql> {
            ?rhea rh:side ?compound .
            ?compound rh:chebi ?metabolite .
        }
        SERVICE <https://sparql.uniprot.org/sparql> {
            ?catalyticActivityAnnotation up:catalyticActivity ?rhea .
            ?protein up:annotation ?catalyticActivityAnnotation ;
                    up:organism ?organism .
        }
        }`;
        const variables = queryVariables(translate(query));
        const expectedVariables = new Set([
            "swisslipid",
            "organism",
            "chebi",
            "compound",
            "metabolite",
            "catalyticActivityAnnotation",
            "rhea",
            "protein"
        ]);
        expect(variables).toStrictEqual(expectedVariables);
    });

});