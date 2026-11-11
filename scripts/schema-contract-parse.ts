/**
 * Parse prisma/schema.prisma into the physical tables and columns the app
 * needs (P1-19). Pure: takes the schema text, so the generator script and the
 * contract test share it. A model's table is its @@map or its name; a column
 * is a scalar or enum field, named by its @map or its field name. Relation
 * fields (typed with another model) are not columns.
 */
export interface SchemaContractObject {
  label: string;
  table: string;
  column?: string;
}

const SCALARS = new Set(["String", "Int", "Float", "Boolean", "DateTime", "Json", "Decimal", "BigInt", "Bytes"]);

export function parseSchemaContract(schema: string): SchemaContractObject[] {
  const enums = new Set([...schema.matchAll(/^enum\s+(\w+)\s*\{/gm)].map((m) => m[1]));
  const objects: SchemaContractObject[] = [];
  for (const block of schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const [, modelName, body] = block;
    const table = body.match(/@@map\("([^"]+)"\)/)?.[1] ?? modelName;
    objects.push({ label: table, table });
    for (const raw of body.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("//") || line.startsWith("@@")) continue;
      const field = line.match(/^(\w+)\s+(\w+)(\[\])?\??/);
      if (!field) continue;
      const [, name, type] = field;
      if (!SCALARS.has(type) && !enums.has(type)) continue;
      const column = line.match(/@map\("([^"]+)"\)/)?.[1] ?? name;
      objects.push({ label: `${table}.${column}`, table, column });
    }
  }
  return objects;
}
