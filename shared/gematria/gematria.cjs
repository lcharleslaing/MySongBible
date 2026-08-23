"use strict";

/**
 * Gematrix-compatible English-language gematria calculations.
 *
 * Simple:
 * A=1 ... Z=26
 *
 * English:
 * Simple * 6
 *
 * Jewish / Hebrew (Gematrix English-letter cipher):
 * A=1 B=2 C=3 D=4 E=5 F=6 G=7 H=8 I=9
 * J=600 K=10 L=20 M=30 N=40 O=50 P=60 Q=70 R=80 S=90
 * T=100 U=200 V=700 W=900 X=300 Y=400 Z=500
 */

const JEWISH_VALUES = Object.freeze({
  A: 1,
  B: 2,
  C: 3,
  D: 4,
  E: 5,
  F: 6,
  G: 7,
  H: 8,
  I: 9,
  J: 600,
  K: 10,
  L: 20,
  M: 30,
  N: 40,
  O: 50,
  P: 60,
  Q: 70,
  R: 80,
  S: 90,
  T: 100,
  U: 200,
  V: 700,
  W: 900,
  X: 300,
  Y: 400,
  Z: 500,
});

function simpleValue(character) {
  const c = String(character || "").toUpperCase();
  if (!/^[A-Z]$/.test(c)) return 0;
  return c.charCodeAt(0) - 64;
}

function jewishValue(character) {
  const c = String(character || "").toUpperCase();
  return JEWISH_VALUES[c] || 0;
}

function normalizeGematriaText(input) {
  return String(input ?? "")
    .replace(/[^A-Za-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function calculateGematria(input) {
  const original = String(input ?? "");
  const normalized = normalizeGematriaText(original);

  let simple = 0;
  let jewish = 0;
  const breakdown = [];

  for (const character of normalized.toUpperCase()) {
    if (!/^[A-Z]$/.test(character)) continue;

    const simpleLetter = simpleValue(character);
    const englishLetter = simpleLetter * 6;
    const jewishLetter = jewishValue(character);

    simple += simpleLetter;
    jewish += jewishLetter;

    breakdown.push({
      character,
      simple: simpleLetter,
      english: englishLetter,
      jewish: jewishLetter,
    });
  }

  return {
    input: original,
    normalized,
    simple,
    english: simple * 6,
    jewish,
    breakdown,
  };
}

module.exports = {
  JEWISH_VALUES,
  simpleValue,
  jewishValue,
  normalizeGematriaText,
  calculateGematria,
};
