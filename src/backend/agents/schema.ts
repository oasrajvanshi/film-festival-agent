// Checks tool arguments from the model against the tool's JSON schema
// (the subset we use: object, string, number, integer, boolean, array, enum,
// required). Small models sometimes send "30" for 30, so numeric strings are
// accepted for numbers. Unknown properties are dropped.

export type JsonSchema = {
  type?: 'object' | 'string' | 'number' | 'integer' | 'boolean' | 'array';
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  enum?: (string | number)[];
  items?: JsonSchema;
};

export interface Checked { ok: boolean; value: unknown; errors: string[] }

export function validate(schema: JsonSchema, value: unknown, path = 'arguments'): Checked {
  const errors: string[] = [];
  const out = check(schema, value, path, errors);
  return { ok: !errors.length, value: out, errors };
}

function check(s: JsonSchema, v: unknown, path: string, errors: string[]): unknown {
  if (s.enum && !s.enum.includes(v as string | number)) {
    errors.push(`${path} must be one of ${s.enum.map(x => JSON.stringify(x)).join(', ')}`);
    return v;
  }
  switch (s.type) {
    case 'object': {
      if (v === undefined || v === null || v === '') v = {};
      if (typeof v !== 'object' || Array.isArray(v)) { errors.push(`${path} must be an object`); return v; }
      const o = v as Record<string, unknown>;
      const res: Record<string, unknown> = {};
      for (const r of s.required ?? []) if (o[r] === undefined || o[r] === null || o[r] === '') errors.push(`${path}.${r} is required`);
      for (const [k, ps] of Object.entries(s.properties ?? {})) if (o[k] !== undefined && o[k] !== null) res[k] = check(ps, o[k], `${path}.${k}`, errors);
      return res;
    }
    case 'string':
      if (typeof v === 'number') return String(v);
      if (typeof v !== 'string') errors.push(`${path} must be a string`);
      return v;
    case 'number': case 'integer': {
      const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
      if (typeof n !== 'number' || !Number.isFinite(n)) { errors.push(`${path} must be a number`); return v; }
      if (s.type === 'integer' && !Number.isInteger(n)) { errors.push(`${path} must be a whole number`); return n; }
      return n;
    }
    case 'boolean':
      if (v === 'true' || v === 'false') return v === 'true';
      if (typeof v !== 'boolean') errors.push(`${path} must be true or false`);
      return v;
    case 'array':
      if (!Array.isArray(v)) { errors.push(`${path} must be a list`); return v; }
      return v.map((x, i) => (s.items ? check(s.items, x, `${path}[${i}]`, errors) : x));
    default:
      return v;
  }
}
