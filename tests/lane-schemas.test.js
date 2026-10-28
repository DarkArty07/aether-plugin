'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const schemas = require('../plugins/aether/lib/lane-schemas.js')

const ROLE_SCHEMAS = [
  'IMPLEMENTER_SCHEMA',
  'SUPERVISOR_SCHEMA',
  'REVIEW_SCHEMA',
  'JUDGE_SCHEMA',
  'WRITER_SCHEMA',
  'SPEC_WRITER_SCHEMA',
  'REVISION_SCHEMA',
  'EXAMINER_SCHEMA',
]

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

// Object schemas in walk order: an entry with type object and a properties map, through properties, items and combinators.
function objectSchemas(schema, found = []) {
  if (Array.isArray(schema)) {
    for (const item of schema) objectSchemas(item, found)
    return found
  }
  if (!isPlainObject(schema)) return found
  if (schema.type === 'object' && isPlainObject(schema.properties)) found.push(schema)
  for (const sub of Object.values(schema.properties ?? {})) objectSchemas(sub, found)
  if (schema.items !== undefined) objectSchemas(schema.items, found)
  for (const key of ['anyOf', 'oneOf', 'allOf']) {
    if (schema[key] !== undefined) objectSchemas(schema[key], found)
  }
  return found
}

test('strictSchema closes a nested object in properties and in an array item, lists every property under required, and keeps enum and description', () => {
  const schema = {
    type: 'object',
    description: 'the answer',
    required: ['name', 'tags'],
    properties: {
      name: { type: 'string', enum: ['a', 'b'], description: 'the name' },
      nested: {
        type: 'object',
        description: 'the nested object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      tags: {
        type: 'array',
        items: {
          type: 'object',
          required: ['label'],
          properties: { label: { type: 'string', enum: ['x'], description: 'the label' } },
        },
      },
      empty: { type: 'object', properties: {} },
      loose: { type: 'object', description: 'no properties' },
      choice: {
        anyOf: [
          { type: 'object', required: ['a'], properties: { a: { type: 'string' } } },
          { type: 'string' },
        ],
        oneOf: [{ type: 'object', required: ['b'], properties: { b: { type: 'number' } } }],
        allOf: [{ type: 'object', required: ['c'], properties: { c: { type: 'boolean' } } }],
      },
    },
  }
  const strict = schemas.strictSchema(schema)
  assert.equal(strict.additionalProperties, false)
  assert.equal(strict.properties.nested.additionalProperties, false)
  assert.equal(strict.properties.tags.items.additionalProperties, false)
  assert.equal(strict.properties.empty.additionalProperties, false)
  assert.equal(strict.properties.loose.additionalProperties, undefined)
  assert.equal(strict.properties.name.additionalProperties, undefined)
  assert.equal(strict.properties.choice.anyOf[0].additionalProperties, false)
  assert.equal(strict.properties.choice.anyOf[1].additionalProperties, undefined)
  assert.equal(strict.properties.choice.oneOf[0].additionalProperties, false)
  assert.equal(strict.properties.choice.allOf[0].additionalProperties, false)
  assert.deepEqual(strict.required, Object.keys(schema.properties))
  assert.deepEqual(strict.properties.nested.required, ['id'])
  assert.deepEqual(strict.properties.empty.required, Object.keys(schema.properties.empty.properties))
  assert.deepEqual(strict.properties.tags.items.required, ['label'])
  assert.deepEqual(strict.properties.name.enum, ['a', 'b'])
  assert.equal(strict.description, 'the answer')
  assert.equal(strict.properties.nested.description, 'the nested object')
  assert.equal(strict.properties.name.description, 'the name')
  assert.deepEqual(strict.properties.tags.items.properties.label.enum, ['x'])
  assert.equal(strict.properties.tags.items.properties.label.description, 'the label')
})

test('strictSchema leaves an explicit additionalProperties alone and does not mutate its input', () => {
  const schema = {
    type: 'object',
    additionalProperties: true,
    required: ['open', 'closed'],
    properties: {
      open: { type: 'object', additionalProperties: true, required: ['n'], properties: { n: { type: 'string', enum: ['a'] } } },
      closed: { type: 'object', additionalProperties: false, required: ['n'], properties: { n: { type: 'string' } } },
    },
  }
  const snapshot = structuredClone(schema)
  const strict = schemas.strictSchema(schema)
  assert.equal(strict.additionalProperties, true)
  assert.equal(strict.properties.open.additionalProperties, true)
  assert.equal(strict.properties.closed.additionalProperties, false)
  strict.required.push('extra')
  strict.properties.open.properties.n.enum.push('b')
  strict.properties.closed.properties.n.type = 'number'
  assert.deepEqual(schema, snapshot)
  assert.notEqual(strict, schema)
  assert.notEqual(strict.properties.open, schema.properties.open)
  assert.notEqual(strict.properties.open.properties.n.enum, schema.properties.open.properties.n.enum)
})

test('every role schema comes out with additionalProperties false on every object and every property required, the optional ones included (a real Muse call refused the Writer schemas without them)', () => {
  for (const name of ROLE_SCHEMAS) {
    const schema = schemas[name]
    const snapshot = structuredClone(schema)
    const strict = schemas.strictSchema(schema)
    const originals = objectSchemas(schema)
    const copies = objectSchemas(strict)
    assert.ok(originals.length > 0, name)
    assert.equal(copies.length, originals.length, name)
    for (let i = 0; i < copies.length; i++) {
      assert.equal(copies[i].additionalProperties, false, `${name} [${i}]`)
      assert.deepEqual(copies[i].required, Object.keys(originals[i].properties), `${name} [${i}] required`)
      for (const key of originals[i].required ?? []) assert.ok(copies[i].required.includes(key), `${name} [${i}] keeps ${key} required`)
    }
    assert.equal(schema.additionalProperties, undefined, name)
    assert.deepEqual(schema, snapshot, name)
  }
})

test('an implementer report with its four required fields is valid without concerns and question (issue #110)', () => {
  assert.deepEqual(schemas.IMPLEMENTER_SCHEMA.required, ['status', 'summary', 'head', 'tests'])
  assert.ok(Object.hasOwn(schemas.IMPLEMENTER_SCHEMA.properties, 'concerns'))
  assert.ok(Object.hasOwn(schemas.IMPLEMENTER_SCHEMA.properties, 'question'))
  const report = { status: 'DONE', summary: 'Implemented the brief.', head: 'abc1234', tests: '3/3 pass' }
  assert.equal(schemas.validate(schemas.IMPLEMENTER_SCHEMA, report), null)
  assert.equal(schemas.validate(schemas.IMPLEMENTER_SCHEMA, { ...report, concerns: '', question: '' }), null)
  assert.equal(schemas.validate(schemas.IMPLEMENTER_SCHEMA, { ...report, concerns: 3 }), 'concerns must be a string')
  assert.equal(schemas.validate(schemas.IMPLEMENTER_SCHEMA, { status: 'DONE', summary: 'x', tests: '3/3 pass' }), 'missing head')
})
