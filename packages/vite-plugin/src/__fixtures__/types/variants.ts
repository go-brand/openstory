// Aliased + imported union — the case react-docgen (Babel) loses but the TS
// type checker resolves. >5 members so it must map to `select`, not `radio`.
export type Variant = "primary" | "secondary" | "ghost" | "danger" | "link" | "subtle";
