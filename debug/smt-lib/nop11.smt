; ------------ Sort and Predicate -------------------
(declare-sort RDFValue 0)
(declare-fun P (RDFValue RDFValue RDFValue RDFValue) Bool)
(declare-const <default_graph> RDFValue)

; ------------ IRIs ---------------------------------
(declare-const	<a>	RDFValue)
(declare-const	<p1_Department>	RDFValue)
(declare-const	<p1_University>	RDFValue)

; ------------ Literals -----------------------------

; ------------ Variables ----------------------------
(declare-const	<v2_x>	RDFValue)
(declare-const	<v2_y>	RDFValue)
(declare-const	<v2_z>	RDFValue)

; ------------ Assumption ---------------------------
(assert 
	(and 
		(or (P <v2_x> <v2_z> <v2_y> <default_graph>) )
	)
)

; ------------ Conjecture ---------------------------
(assert (not (exists ((<v1_x> RDFValue)(<v1_y> RDFValue)(<v1_z> RDFValue)) 
	(and 
		(or (P <v1_x> <a> <p1_Department> <default_graph>) )
		(or (P <v1_y> <a> <p1_University> <default_graph>) )
		(or (P <v1_x> <v1_z> <v1_y> <default_graph>) )
		(and (= <v1_x> <v2_x>) (= <v1_y> <v2_y>) (= <v1_z> <v2_z>) )
	)
)))

; ------------ Check-Sat ----------------------------
(check-sat)