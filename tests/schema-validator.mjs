// llm-orchestrator · created by Bogdan-Gabriel Torcescu · https://www.linkedin.com/in/bogdantorcescu/ · keep this credit when copying or deriving
/**
 * The JSON Schema subset these schemas actually use. Shared so every schema is
 * checked by the same validator instead of each test growing its own.
 */
export function validate(schema, value, path = '$', errors = []) {
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actual = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
    const ok = types.some((type) => type === actual
      || (type === 'integer' && Number.isInteger(value))
      || (type === 'number' && actual === 'number'));
    if (!ok) errors.push(`${path}: expected ${types.join('|')}, got ${actual}`);
  }
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${path}: ${JSON.stringify(value)} not in enum`);
  if (schema.const !== undefined && value !== schema.const) errors.push(`${path}: expected const ${schema.const}`);
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: ${value} < minimum ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path}: ${value} > maximum ${schema.maximum}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path}: ${value.length} items < minItems ${schema.minItems}`);
    if (schema.items) value.forEach((entry, index) => validate(schema.items, entry, `${path}[${index}]`, errors));
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of schema.required ?? []) {
      if (!(key in value)) errors.push(`${path}: missing required key ${key}`);
    }
    const patterns = Object.entries(schema.patternProperties ?? {});
    for (const [key, entry] of Object.entries(value)) {
      const property = schema.properties?.[key];
      if (property) { validate(property, entry, `${path}.${key}`, errors); continue; }
      const matched = patterns.find(([pattern]) => new RegExp(pattern).test(key));
      if (matched) { validate(matched[1], entry, `${path}.${key}`, errors); continue; }
      if (schema.additionalProperties === false) errors.push(`${path}: unexpected key ${key}`);
      else if (schema.additionalProperties && typeof schema.additionalProperties === 'object') validate(schema.additionalProperties, entry, `${path}.${key}`, errors);
    }
  }
  return errors;
}
