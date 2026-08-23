"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { calculateGematria } = require("./gematria.cjs");

test("Gematrix example: simple", () => {
  const result = calculateGematria("simple");
  assert.equal(result.simple, 74);
  assert.equal(result.english, 444);
  assert.equal(result.jewish, 214);
});

test("punctuation and spaces do not affect values", () => {
  const a = calculateGematria("Love is good");
  const b = calculateGematria("Love, is good!");
  assert.equal(a.simple, b.simple);
  assert.equal(a.english, b.english);
  assert.equal(a.jewish, b.jewish);
});

test("English is always Simple times six", () => {
  const result = calculateGematria("My Song Bible");
  assert.equal(result.english, result.simple * 6);
});
