/**
 * Partial implementation of the SpeCS paper following the explanation of the paper "Solving the SPARQL query containment problem with SpeCS"
 * SPASIĆ, Mirko; JANIČIĆ, Milena Vujošević. Solving the SPARQL query containment problem with SpeCS. Journal of Web Semantics, 2023, 76: 100770.
 * https://doi.org/10.1016/j.websem.2022.100770
 * 
 * The reference to definition are from the paper above.
 * 
 * Official implementation
 * https://github.com/mirkospasic/SpeCS
 */
import { Algebra, Util } from "sparqlalgebrajs";
import type * as RDF from '@rdfjs/types';
import { instantiateThetaConjecture, instantiateTemplate, instantiateTriplePatternStatementTemplate, local_var_declaration, instantiateQueryContainmentConjecture } from "./templates";
import * as Z3_SOLVER from 'z3-solver';
import { type SafePromise, result, error, isError } from "result-interface";
import { hasProjection, queryVariables } from "../query";

const { Z3,
} = await Z3_SOLVER.init();

export interface ISolverResponse {
    result: boolean,
    smtlib?: string,
    justification?: string,
    nestedResponses?: Record<string, ISolverResponse>
}

export enum SEMANTIC {
    SET,
    BAG_SET,
    BAG
}

export async function isContained(subQ: Algebra.Operation, superQ: Algebra.Operation, semantic: SEMANTIC = SEMANTIC.SET): SafePromise<ISolverResponse, string> {
    // generate the variable of the specs formalism
    const subQRepresentation = generateQueryRepresentation(subQ);
    const superQRepresentation = generateQueryRepresentation(superQ);

    switch (semantic) {
        case SEMANTIC.SET:
            return setSemanticContainment(subQRepresentation, superQRepresentation);
        case SEMANTIC.BAG_SET:
            if (hasProjection(subQ)) {
                return bagSetSemanticContainment(subQRepresentation, superQRepresentation);
            }
            return setSemanticContainment(subQRepresentation, superQRepresentation);
        case SEMANTIC.BAG:
            return error("not implemented");
    }

}


async function bagSetSemanticContainment(subQRepresentation: IQueryRepresentation, superQRepresentation: IQueryRepresentation): SafePromise<ISolverResponse, string> {
    const subVariable = {
        variables: subQRepresentation.variables, relevantVariables: subQRepresentation.rv
    };
    const superVariable = {
        variables: superQRepresentation.variables, relevantVariables: superQRepresentation.rv
    };

    const tildeCheckIsValid = tildeCheckBagSet(subVariable, superVariable);
    return abstractContainment(tildeCheckIsValid, subQRepresentation, superQRepresentation);
}

async function setSemanticContainment(subQRepresentation: IQueryRepresentation, superQRepresentation: IQueryRepresentation): SafePromise<ISolverResponse, string> {
    const tildeCheckIsValid = tildeCheck(subQRepresentation.rv, superQRepresentation.rv);
    return abstractContainment(tildeCheckIsValid, subQRepresentation, superQRepresentation);
}

function associateServiceClauses(subService: IService[], superService: IService[]): IServiceQueryAssoc[] {
    const subQ: Map<string, IService> = new Map(subService.map((el) => [el.url, el]));
    const superQ: Map<string, IService> = new Map(superService.map((el) => [el.url, el]));
    const assoc: IServiceQueryAssoc[] = [];

    for (const [key, subService] of subQ) {
        const superService = superQ.get(key)!;
        const current: IServiceQueryAssoc = {
            subQ: subService.query,
            superQ: superService.query,
            url: key
        }

        assoc.push(current);
    }

    return assoc;
}

async function abstractContainment(compatibilityCheck: boolean, subQRepresentation: IQueryRepresentation, superQRepresentation: IQueryRepresentation): SafePromise<ISolverResponse, string> {
    if (!compatibleServiceClauses(subQRepresentation.service, superQRepresentation.service)) {
        return result({ result: false, justification: "queries does not have the same URL for the service clauses" });
    }

    const serviceAssoc = associateServiceClauses(subQRepresentation.service, superQRepresentation.service);

    const intermediaryResults: Record<string, ISolverResponse> = {};
    for (const { subQ, superQ, url } of serviceAssoc) {
        const res = await setSemanticContainment(subQ, superQ);
        if (isError(res)) {
            return res;
        }
        if (res.value.result === false) {
            intermediaryResults[url] = res.value;
            return result({ result: false, justification: `service at url ${url} is not contained`, serviceSmtlib: intermediaryResults });
        }
        intermediaryResults[url] = res.value;
    }

    if (compatibilityCheck) {
        const queryContainmentSmtLibString = generateQueryContainment(subQRepresentation.sigmas, subQRepresentation.rv, superQRepresentation.sigmas, superQRepresentation.rv);
        let config = Z3.mk_config();
        let ctx = Z3.mk_context_rc(config);
        const response = await Z3.eval_smtlib2_string(ctx, queryContainmentSmtLibString);
        if (response.startsWith("unsat")) {
            return result({ result: true, smtlib: queryContainmentSmtLibString });
        } else if (response.startsWith("sat")) {
            return result({ result: false, smtlib: queryContainmentSmtLibString });
        }
        return error(`Z3 returns ${response}`);
    }
    const thetaEvaluationSmtLibString = generateThetaSmtLibString(subQRepresentation.sigmas, subQRepresentation.rv);
    let config = Z3.mk_config();
    let ctx = Z3.mk_context_rc(config);
    const response = await Z3.eval_smtlib2_string(ctx, thetaEvaluationSmtLibString);
    if (response.startsWith("unsat")) {
        return result({ result: false, smtlib: thetaEvaluationSmtLibString });
    } else if (response.startsWith("sat")) {
        return result({ result: true, smtlib: thetaEvaluationSmtLibString });
    }
    return error(`Z3 returns ${response}`);
}

export function compatibleServiceClauses(subService: IService[], superService: IService[]): boolean {
    const subUrls = new Set(subService.map((el) => el.url));
    const superUrls = new Set(superService.map((el) => el.url));

    for (const url of subUrls) {
        if (!superUrls.has(url)) {
            return false;
        }
    }
    return true;
}

export function generateQueryContainment(sub_sigmas: Sigma[], sub_rvs: IRv[], super_sigmas: Sigma[], super_rvs: IRv[],): string {
    const {
        iri: subIriDeclarationString,
        literal: subLiteralDeclarationsString,
        variable: subVariableDeclarationsString,
        tp: subTriplePatternsAssertions
    } = generatePrelude(sub_sigmas, sub_rvs);

    const {
        iri: superIriDeclarationString,
        literal: superLiteralDeclarationsString,
        variable: superVariableDeclarationsString,
        tp: superTriplePatternsAssertions
    } = generatePrelude(super_sigmas, super_rvs);

    const subTriplePatternsAssertionsString = subTriplePatternsAssertions.join("\n");
    const superTriplePatternsAssertionsString = superTriplePatternsAssertions.join("\n");

    const [local_declaration, local_equality] = local_var_declaration(super_rvs);

    const conjecture = instantiateQueryContainmentConjecture(
        subTriplePatternsAssertionsString,
        superTriplePatternsAssertionsString,
        local_declaration,
        local_equality
    );

    const iris = Array.from(new Set([...subIriDeclarationString, ...superIriDeclarationString])).join("\n");
    const literals = Array.from(new Set([...subLiteralDeclarationsString, ...superLiteralDeclarationsString])).join("\n");
    const variables = Array.from(new Set([...subVariableDeclarationsString, ...superVariableDeclarationsString])).join("\n");

    const instance = instantiateTemplate(iris, literals, variables, conjecture);
    return instance;
}

function generatePrelude(sigmas: Sigma[], rvs: IRv[]): { iri: string[], literal: string[], variable: string[], tp: string[] } {
    let iriDeclarations: string[] = [];
    let literalDeclarations: string[] = [];
    let variableDeclarations: string[] = [];

    const triplePatternsAssertions: string[] = [];

    for (const sigma of sigmas) {
        iriDeclarations = [...iriDeclarations, ...sigma.iriDeclarations];
        literalDeclarations = [...literalDeclarations, ...sigma.literalDeclarations];
        variableDeclarations = [...variableDeclarations, ...sigma.variableDeclarations];
        const triplePatternsStatementAssertion = instantiateTriplePatternStatementTemplate(sigma.subject, sigma.predicate, sigma.object);
        triplePatternsAssertions.push(triplePatternsStatementAssertion);
    }

    return {
        iri: iriDeclarations,
        literal: literalDeclarations,
        variable: variableDeclarations,
        tp: triplePatternsAssertions
    };
}

export function generateThetaSmtLibString(sigmas: Sigma[], rvs: IRv[]): string {
    const {
        iri: iriDeclarationString,
        literal: literalDeclarationsString,
        variable: variableDeclarationsString,
        tp: triplePatternsAssertions
    } = generatePrelude(sigmas, rvs);

    const triplePatternsAssertionsString = triplePatternsAssertions.join("\n");

    const [localVarDeclaration, localVarAssoc] = local_var_declaration(rvs);
    const thetaConjecture = instantiateThetaConjecture(triplePatternsAssertionsString, localVarDeclaration, localVarAssoc);

    const instance = instantiateTemplate(
        Array.from(new Set(iriDeclarationString)).join("\n"),
        Array.from(new Set(literalDeclarationsString)).join("\n"),
        Array.from(new Set(variableDeclarationsString)).join("\n"),
        thetaConjecture);

    return instance;
}

/**
 * Perform the ∼ operation described in definition (4.8)
 * @param {IRv[]} subQRv - relevant variables of the sub query
 * @param {IRv[]} superQRv - relevant variables of the super query
 * @returns {boolean} if the operation is valid
 */
export function tildeCheck(subQRv: IRv[], superQRv: IRv[]): boolean {
    const setRvSubQ = new Set(subQRv.map((el) => el.name));
    const setRvSuperQ = new Set(superQRv.map((el) => el.name));
    if (setRvSubQ.size !== setRvSuperQ.size) {
        return false;
    }
    for (const el of setRvSubQ) {
        if (!setRvSuperQ.has(el)) {
            return false;
        }
    }
    return true;
}

export function tildeCheckBagSet(subVariables: { variables: Set<string>, relevantVariables: IRv[] }, superVariables: { variables: Set<string>, relevantVariables: IRv[] }): boolean {
    const respSetCheck = tildeCheck(subVariables.relevantVariables, superVariables.relevantVariables);
    if (!respSetCheck) {
        return false;
    }
    return superVariables.variables.isSupersetOf(subVariables.variables);
}

function generateQueryRepresentation(query: Algebra.Operation): IQueryRepresentation {
    const sigmas = generateSigmas(query);
    const ovRv = generateOvRv(query);
    const variables = queryVariables(query);
    const service = generateService(query);

    return {
        sigmas,
        variables,
        ...ovRv,
        service
    }
}

function generateService(query: Algebra.Operation): IService[] {
    const serviceOperations: IService[] = [];
    Util.recurseOperation(query, {
        [Algebra.types.SERVICE]: (op: Algebra.Service) => {
            const service = new Service(op.input, op.name.value);
            serviceOperations.push(service);
            return true;
        }
    });

    return serviceOperations;
}
/**
 * generate the sigma terms representing the expression of the query see Definition 4.2 and 4.4
 * @param {Algebra.Operation} query 
 * @returns {Sigma[]}
 */
export function generateSigmas(query: Algebra.Operation): Sigma[] {
    const result: Sigma[] = [];
    Util.recurseOperation(query, {
        [Algebra.types.PATTERN]: (op: Algebra.Pattern) => {
            const sigma: ISigmaTerm = new SigmaTerm(
                op.subject,
                op.predicate,
                op.object,
            );
            result.push(sigma);
            return false;
        }
    });
    return result;
}

/**
 * generate the relevant variables rv (definition 4.6) and the ov variables (definition 4.5)
 * @param {Algebra.Operation} query 
 * @returns {{ ov: IOv[], rv: IRv[] }}
 */
export function generateOvRv(query: Algebra.Operation): { ov: IOv[], rv: IRv[] } {
    const result: { ov: Ov[], rv: Rv[] } = {
        ov: [],
        rv: []
    };
    const projectedVariables: Set<string> = new Set();
    const usedVariables: Set<string> = new Set();

    Util.recurseOperation(query, {
        [Algebra.types.PROJECT]: (op: Algebra.Project) => {
            for (const variable of op.variables) {
                projectedVariables.add(variable.value);
            }
            return true;
        },
        [Algebra.types.PATTERN]: (op: Algebra.Pattern) => {
            if (op.subject.termType === "Variable") {
                usedVariables.add(op.subject.value);
            }
            if (op.predicate.termType === "Variable") {
                usedVariables.add(op.predicate.value);
            }
            if (op.object.termType === "Variable") {
                usedVariables.add(op.object.value);
            }
            return false;
        }
    });
    const usedButNotProjected = [];
    for (const variable of usedVariables) {
        if (!projectedVariables.has(variable)) {
            usedButNotProjected.push(variable);
        }
    }

    for (const variable of usedButNotProjected) {
        const ov = new Ov(variable);
        result.ov.push(ov);
    }
    for (const variable of usedVariables) {
        if (projectedVariables.has(variable)) {
            const rv = new Rv(variable);
            result.rv.push(rv);
        }
    }
    return result;
}

export function renameIriforSmt(iri: string): string {
    let resp = iri;
    resp = resp.replace("http://", "");
    resp = resp.replace("https://", "");
    resp = resp.replace("www.", "");


    resp = resp.replaceAll(".", "_");
    resp = resp.replaceAll("/", "_");
    resp = resp.replaceAll("-", "_");
    resp = resp.replaceAll("%", "_");
    resp = resp.replaceAll("#", "_");

    return resp;
}

/**
 * An ov variable (definition 4.6)
 */
export interface IOv {
    name: string;
}

class Ov implements IOv {
    public readonly name: string;

    public constructor(name: string) {
        this.name = name;
    }
}

export interface IService {
    url: string;
    query: IQueryRepresentation
}

export class Service implements IService {
    public readonly url: string;
    public readonly query: IQueryRepresentation;

    public constructor(query: Algebra.Operation, url: string) {
        this.url = url;
        this.query = generateQueryRepresentation(query);
    }
}
/**
 * A relevant variable (definition 4.6)
 */
export interface IRv {
    name: string
}

class Rv implements IRv {
    public readonly name: string;

    public constructor(name: string) {
        this.name = name;
    }
}
/**
 * A sigma function (definition 4.4)
 */
export type Sigma = ISigmaTerm;

/**
 * A sigma function (definition 4.4 Term)
 */
export interface ISigmaTerm {
    subject: string;
    predicate: string;
    object: string;

    iriDeclarations: string[];
    literalDeclarations: string[];
    variableDeclarations: string[];
}

export class SigmaTerm implements ISigmaTerm {

    private static literalCounter = 0;

    public readonly subject: string;
    public readonly predicate: string;
    public readonly object: string;

    public readonly iriDeclarations: string[];
    public readonly literalDeclarations: string[];
    public readonly variableDeclarations: string[];


    public constructor(subject: RDF.Term, predicate: RDF.Term, object: RDF.Term) {

        const smtLibDeclaration: { iri: string[], literal: string[], variable: string[] } = {
            iri: [],
            literal: [],
            variable: []
        };
        this.subject = this.generateSMTlibTerm(subject);
        this.predicate = this.generateSMTlibTerm(predicate);
        this.object = this.generateSMTlibTerm(object);

        this.addATermToTheDeclaration(subject, this.subject, smtLibDeclaration);
        this.addATermToTheDeclaration(predicate, this.predicate, smtLibDeclaration);
        this.addATermToTheDeclaration(object, this.object, smtLibDeclaration);

        this.iriDeclarations = smtLibDeclaration.iri;
        this.literalDeclarations = smtLibDeclaration.literal;
        this.variableDeclarations = smtLibDeclaration.variable;
    }

    public static generateDeclareSmtLibString(constantName: string): string {
        return `(declare-const ${constantName} RDFValue)`;
    }

    private generateSMTlibTerm(term: RDF.Term): string {
        if (term.termType === "NamedNode") {
            return `<${renameIriforSmt(term.value)}>`
        } else if (term.termType === "Literal") {
            const name = `<l_${SigmaTerm.literalCounter}>`;
            SigmaTerm.literalCounter += 1;
            return name
        } else if (term.termType === "Variable" || term.termType === "BlankNode") {
            return `<${term.value}>`;
        }
        throw new Error(`The term sent was not a NamedNode, a Literal or a Variable but was ${term.termType}`);
    }

    private addATermToTheDeclaration(term: RDF.Term, constantName: string, resp: { iri: string[], literal: string[], variable: string[] }) {
        const constanceDeclaration = SigmaTerm.generateDeclareSmtLibString(constantName);

        if (term.termType === "NamedNode") {
            resp.iri.push(constanceDeclaration);
        } else if (term.termType === "Literal") {
            resp.literal.push(constanceDeclaration);
        } else if (term.termType === "Variable" || term.termType === "BlankNode") {
            resp.variable.push(constanceDeclaration);
        }
    }
}

interface IQueryRepresentation {
    sigmas: Sigma[];
    variables: Set<string>;
    ov: Ov[];
    rv: Rv[];
    service: IService[]
}

interface IServiceQueryAssoc {
    subQ: IQueryRepresentation,
    superQ: IQueryRepresentation,
    url: string
}