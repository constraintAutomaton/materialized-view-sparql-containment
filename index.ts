import * as Z3_SOLVER from 'z3-solver';

const { Z3,
} = await Z3_SOLVER.init();

const query = `
; ------------ Sort and Predicate -------------------
(declare-sort RDFValue 0)
(declare-fun P (RDFValue RDFValue RDFValue RDFValue) Bool)
(declare-const <default_graph> RDFValue)

; ------------ IRIs ---------------------------------

; ------------ Literals -----------------------------

; ------------ Variables ----------------------------
(declare-const <sub_s> RDFValue)
(declare-const <sub_p> RDFValue)
(declare-const <sub_o> RDFValue)
; ------------ Conjecture ---------------------------

(assert
    (and
        (or (P <sub_s> <sub_p> <sub_o> <default_graph>))
    )
)

; ------------ Check-Sat ----------------------------
(check-sat)
`;

let config = Z3.mk_config();
let ctx = Z3.mk_context_rc(config);
const response = await Z3.eval_smtlib2_string(ctx, query);

console.log(`response ${response}`);