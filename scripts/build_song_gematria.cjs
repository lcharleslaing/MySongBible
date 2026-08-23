#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { calculateGematria } = require("../shared/gematria/gematria.cjs");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const SONGS_IMPORT_PATH = path.join(PROJECT_ROOT, "songs-import.json");
const BACKUP_PATH = path.join(PROJECT_ROOT, "songs-import.before-gematria.json");
const TRANSCRIPT_PREFERENCE = Object.freeze(["txt", "lrc", "srt", "vtt", "json"]);
const SYSTEMS = Object.freeze(["jewish", "english", "simple"]);
const ANALYSIS_LEVELS = Object.freeze([
  "vocabulary_word",
  "title",
  "title_word",
  "lyrics",
  "source_line",
  "explicit_section",
  "title_plus_lyrics",
]);
const LIKELY_NON_SONG_ARTIFACTS = Object.freeze(["2-stem", "phase2", "phase3", "phase4", "phase5"]);

const APOSTROPHE_MAP = Object.freeze({
  "\u2018": "'",
  "\u2019": "'",
  "\u201a": "'",
  "\u201b": "'",
  "\u2032": "'",
  "\uff07": "'",
  "\u201c": '"',
  "\u201d": '"',
  "\u201e": '"',
  "\u201f": '"',
});
const WORD_RE = /[a-z]+(?:'[a-z]+)*/g;
const HYPHEN_RE = /[-\u2010-\u2015]+/g;
const SRT_INDEX_RE = /^\s*\d+\s*$/;
const SRT_TIMESTAMP_RE = /\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*-->\s*\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}/;
const VTT_TIMESTAMP_RE = /(?:\d{1,2}:)?\d{2}:\d{2}\.\d{1,3}\s*-->\s*(?:\d{1,2}:)?\d{2}:\d{2}\.\d{1,3}/;
const LRC_TIMESTAMP_RE = /\[[^\]]*\d{1,2}:\d{2}(?:\.\d+)?[^\]]*\]/g;
const NON_LYRIC_MARKER_RE = /[\[(]\s*(?:music(?:\s+playing)?(?:\s*[-:][^\])]+)?|silence|blank[_\s-]*audio|applause|audience cheering|cheering|laughter)\s*[\])]/gi;
const SECTION_LABEL_RE = /^\s*\[\s*((?:(?:pre|post)[-\s]*)?chorus|verse|bridge|intro|outro|spoken(?:\s+intro)?|hook|refrain|tag|breakdown)(?:\s+([^\]]+?))?\s*\]\s*$/i;
const CONTRIBUTING_LETTER_RE = /[A-Za-z]/g;

const TEXT_RECORD_KEYS = Object.freeze(["content", "text", "lyrics", "transcript", "transcription"]);
const JSON_SEQUENCE_KEYS = Object.freeze(["transcription", "segments", "phrases", "chunks", "words"]);
const METADATA_TEXT_KEYS = new Set([
  "destination_audio_name",
  "engine",
  "engine_version_target",
  "file",
  "filename",
  "implementation",
  "imported_at",
  "language",
  "manifest_file",
  "model",
  "output_file",
  "path",
  "phase",
  "reference_file",
  "relative_path",
  "sha256",
  "source_audio",
  "source_instrumental",
  "source_name",
  "source_reference",
  "source_residual",
  "source_vocals",
  "systeminfo",
  "vocal_file",
]);

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJsonAtomic(filePath, data) {
  const tempPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.tmp`);
  const mode = fs.statSync(filePath).mode;
  fs.writeFileSync(tempPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  fs.chmodSync(tempPath, mode);
  fs.renameSync(tempPath, filePath);
}

function gematriaValues(input) {
  const result = calculateGematria(input);
  return {
    jewish: result.jewish,
    english: result.english,
    simple: result.simple,
  };
}

function normalizeText(value) {
  return String(value ?? "")
    .replace(/[\u2018\u2019\u201a\u201b\u2032\uff07\u201c\u201d\u201e\u201f]/g, (char) => APOSTROPHE_MAP[char] || char)
    .replace(HYPHEN_RE, " ")
    .toLowerCase();
}

function tokenize(value) {
  return normalizeText(value).match(WORD_RE) || [];
}

function tokenizeGematriaWords(value) {
  return calculateGematria(value).normalized.toLowerCase().match(/[a-z]+/g) || [];
}

function letterCount(value) {
  return (String(value ?? "").match(CONTRIBUTING_LETTER_RE) || []).length;
}

function cleanTranscriptText(text) {
  return String(text ?? "").replace(NON_LYRIC_MARKER_RE, " ");
}

function usableText(text) {
  const value = String(text ?? "").trim();
  if (!value) return "";
  return tokenize(value).length > 0 ? value : "";
}

function stripLrcLine(line) {
  return line.replace(LRC_TIMESTAMP_RE, "").trim();
}

function stripSrtLines(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !SRT_INDEX_RE.test(line) && !SRT_TIMESTAMP_RE.test(line));
}

function stripVttLines(text) {
  return String(text ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && line !== "WEBVTT" && !line.startsWith("NOTE") && !line.startsWith("STYLE") && !line.startsWith("REGION") && !VTT_TIMESTAMP_RE.test(line));
}

function textFromRecords(records) {
  if (!Array.isArray(records)) return "";

  const chunks = [];
  for (const record of records) {
    if (record && typeof record === "object" && !Array.isArray(record)) {
      for (const key of TEXT_RECORD_KEYS) {
        const value = record[key];
        if (typeof value === "string" && usableText(cleanTranscriptText(value))) {
          chunks.push(value);
          break;
        }
      }
    } else if (typeof record === "string" && usableText(cleanTranscriptText(record))) {
      chunks.push(record);
    }
  }
  return chunks.join("\n");
}

function* jsonTextCandidates(value) {
  let parsed = value;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      yield parsed;
      return;
    }
  }

  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      yield* jsonTextCandidates(item);
    }
    return;
  }

  if (!parsed || typeof parsed !== "object") return;

  for (const key of TEXT_RECORD_KEYS) {
    if (typeof parsed[key] === "string") {
      yield parsed[key];
    }
  }

  for (const key of JSON_SEQUENCE_KEYS) {
    const text = textFromRecords(parsed[key]);
    if (text) yield text;
  }

  for (const [key, child] of Object.entries(parsed)) {
    if (METADATA_TEXT_KEYS.has(String(key).toLowerCase())) continue;
    if (child && typeof child === "object") {
      yield* jsonTextCandidates(child);
    }
  }
}

function transcriptTextForSource(source, value) {
  if (source === "json") {
    for (const candidate of jsonTextCandidates(value)) {
      const text = usableText(cleanTranscriptText(candidate));
      if (text) return text;
    }
    return "";
  }

  if (typeof value !== "string") return "";
  if (source === "lrc") {
    return value.split(/\r?\n/).map(stripLrcLine).filter(Boolean).join("\n");
  }
  if (source === "srt") {
    return stripSrtLines(value).join("\n");
  }
  if (source === "vtt") {
    return stripVttLines(value).join("\n");
  }
  return value;
}

function canonicalTranscript(song) {
  const requestedSource = song.word_analysis?.transcript_source;
  if (Object.hasOwn(song.word_analysis || {}, "transcript_source") && !requestedSource) {
    return { source: null, text: "" };
  }
  const sources = requestedSource ? [requestedSource] : TRANSCRIPT_PREFERENCE;
  const transcripts = song.transcripts;

  if (!transcripts || typeof transcripts !== "object" || Array.isArray(transcripts)) {
    return { source: null, text: "" };
  }

  for (const source of sources) {
    if (!Object.hasOwn(transcripts, source)) continue;
    const value = transcripts[source];
    const candidates = Array.isArray(value) && source !== "json" ? value : [value];
    for (const candidate of candidates) {
      const text = usableText(cleanTranscriptText(transcriptTextForSource(source, candidate)));
      if (text) return { source, text };
    }
  }

  return { source: null, text: "" };
}

function sourceLinesForTranscript(source, text) {
  if (!text) return [];
  if (source === "lrc") {
    return text.split(/\r?\n/).map(stripLrcLine).filter(Boolean);
  }
  if (source === "srt") return stripSrtLines(text);
  if (source === "vtt") return stripVttLines(text);
  return String(text).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function parseSectionLabel(text) {
  const match = SECTION_LABEL_RE.exec(text);
  if (!match) return null;

  const base = match[1].replace(/\s+/g, " ").replace(/\s*-\s*/g, "-").trim();
  const suffix = (match[2] || "").replace(/\s+/g, " ").trim();
  const labelBase = base
    .split(/[-\s]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(base.includes("-") ? "-" : " ");
  const label = suffix ? `${labelBase} ${suffix}` : labelBase;
  const type = base.toLowerCase().replace(/\s+/g, "-");

  return { type, label };
}

function lineAnalysis(lineNumber, text) {
  const words = tokenizeGematriaWords(text);
  return {
    line_number: lineNumber,
    text,
    letter_count: letterCount(text),
    word_count: words.length,
    gematria: gematriaValues(text),
    words: words.map((word, index) => ({
      word,
      position: index + 1,
    })),
  };
}

function buildLineAndSectionAnalysis(source, canonicalText) {
  const lines = [];
  const sections = [];
  const sourceLines = sourceLinesForTranscript(source, canonicalText);
  let currentSection = null;
  let explicitSectionCount = 0;

  for (const rawLine of sourceLines) {
    const cleaned = cleanTranscriptText(rawLine).trim();
    if (!cleaned || !usableText(cleaned)) continue;

    const sectionLabel = parseSectionLabel(cleaned);
    if (sectionLabel) {
      if (currentSection) {
        currentSection.end_line = lines.length;
      }
      explicitSectionCount += 1;
      currentSection = {
        section_number: explicitSectionCount,
        type: sectionLabel.type,
        label: sectionLabel.label,
        start_line: lines.length + 1,
        end_line: lines.length,
        letter_count: 0,
        word_count: 0,
        gematria: gematriaValues(""),
      };
      sections.push(currentSection);
      continue;
    }

    const analyzedLine = lineAnalysis(lines.length + 1, cleaned);
    lines.push(analyzedLine);

    if (currentSection) {
      currentSection.end_line = analyzedLine.line_number;
      currentSection.letter_count += analyzedLine.letter_count;
      currentSection.word_count += analyzedLine.word_count;
      currentSection.gematria.jewish += analyzedLine.gematria.jewish;
      currentSection.gematria.english += analyzedLine.gematria.english;
      currentSection.gematria.simple += analyzedLine.gematria.simple;
    }
  }

  return {
    lines,
    sections,
    section_detection: sections.length ? "explicit" : "none",
  };
}

function titleAnalysis(song) {
  const text = String(song.title ?? "");
  const words = tokenizeGematriaWords(text);

  return {
    text,
    letter_count: letterCount(text),
    word_count: words.length,
    gematria: gematriaValues(text),
    words: words.map((word, index) => ({
      word,
      position: index + 1,
      gematria: gematriaValues(word),
    })),
  };
}

function lyricsAnalysis(song) {
  const { source, text } = canonicalTranscript(song);
  if (!source || !text) {
    return {
      available: false,
      transcript_source: null,
      gematria: null,
      letter_count: 0,
      word_count: 0,
      unique_word_count: 0,
      lines: [],
      section_detection: "none",
      sections: [],
    };
  }

  const { lines, sections, section_detection: sectionDetection } = buildLineAndSectionAnalysis(source, text);
  const lyricTextForCalculation = lines.map((line) => line.text).join("\n");
  const words = tokenizeGematriaWords(lyricTextForCalculation);
  const wordAnalysis = song.word_analysis || {};

  return {
    available: true,
    transcript_source: source,
    gematria: gematriaValues(lyricTextForCalculation),
    letter_count: letterCount(lyricTextForCalculation),
    word_count: wordAnalysis.lyric_word_count ?? words.length,
    unique_word_count: new Set(words).size,
    lines,
    section_detection: sectionDetection,
    sections,
  };
}

function combinedAnalysis(title, lyrics) {
  const parts = [title.text];
  if (lyrics.available) {
    parts.push(...lyrics.lines.map((line) => line.text));
  }
  return {
    title_plus_lyrics: {
      gematria: gematriaValues(parts.join("\n")),
    },
  };
}

function addVocabularyGematria(data) {
  const words = data.vocabulary?.words;
  if (!Array.isArray(words)) throw new Error("songs-import.json is missing vocabulary.words");

  for (const record of words) {
    record.gematria = gematriaValues(record.word);
  }

  return words.length;
}

function addSongGematria(data) {
  let songsWithLyrics = 0;
  let lyricLines = 0;
  let explicitSections = 0;
  let songsWithExplicitSections = 0;
  const sectionLabelCounts = new Map();
  const sampleTitles = [];
  const sampleLines = [];

  for (const song of data.songs || []) {
    const title = titleAnalysis(song);
    const lyrics = lyricsAnalysis(song);
    const combined = combinedAnalysis(title, lyrics);

    song.gematria_analysis = {
      title,
      lyrics,
      combined,
    };

    if (sampleTitles.length < 10) {
      sampleTitles.push({ title: title.text, gematria: title.gematria });
    }

    if (lyrics.available) {
      songsWithLyrics += 1;
      lyricLines += lyrics.lines.length;
      explicitSections += lyrics.sections.length;
      if (lyrics.sections.length) songsWithExplicitSections += 1;

      for (const section of lyrics.sections) {
        const key = `${section.type}\t${section.label}`;
        sectionLabelCounts.set(key, (sectionLabelCounts.get(key) || 0) + 1);
      }

      for (const line of lyrics.lines) {
        if (sampleLines.length >= 20) break;
        sampleLines.push({
          song_title: song.title,
          line_number: line.line_number,
          text_preview: line.text.length > 80 ? `${line.text.slice(0, 77)}...` : line.text,
          gematria: line.gematria,
        });
      }
    }
  }

  data.gematria = {
    engine: "shared/gematria/gematria.cjs",
    systems: [...SYSTEMS],
    songs_analyzed: Array.isArray(data.songs) ? data.songs.length : 0,
    songs_with_lyrics_analyzed: songsWithLyrics,
    vocabulary_words_analyzed: data.vocabulary.words.length,
    analysis_levels: [...ANALYSIS_LEVELS],
  };

  return {
    songsAnalyzed: data.gematria.songs_analyzed,
    songsWithLyrics,
    titlesAnalyzed: data.gematria.songs_analyzed,
    lyricLines,
    explicitSections,
    songsWithExplicitSections,
    songsWithoutExplicitSections: data.gematria.songs_analyzed - songsWithExplicitSections,
    sectionLabelCounts,
    sampleTitles,
    sampleLines,
  };
}

function sumWordGematria(words) {
  return words.reduce((acc, wordRecord) => {
    const values = gematriaValues(wordRecord.word);
    acc.jewish += values.jewish;
    acc.english += values.english;
    acc.simple += values.simple;
    return acc;
  }, { jewish: 0, english: 0, simple: 0 });
}

function assertEnglishEqualsSimpleTimesSix(label, values) {
  if (!values) return;
  if (values.english !== values.simple * 6) {
    throw new Error(`${label} has english=${values.english}, simple=${values.simple}`);
  }
}

function validate(data) {
  const validation = {
    known_regression_simple: false,
    vocabulary_words_have_gematria: false,
    vocabulary_words_unique: false,
    all_songs_have_title_analysis: false,
    lyric_songs_have_whole_lyrics_analysis: false,
    usable_lyric_lines_have_gematria: false,
    line_values_equal_word_sums: false,
    english_equals_simple_times_six: false,
    section_labels_excluded: false,
    no_fake_sections: false,
  };

  const regression = gematriaValues("simple");
  if (regression.jewish !== 214 || regression.english !== 444 || regression.simple !== 74) {
    throw new Error(`Known regression failed for "simple": ${JSON.stringify(regression)}`);
  }
  validation.known_regression_simple = true;

  const vocabularyWords = data.vocabulary.words || [];
  const wordKeys = vocabularyWords.map((record) => record.word);
  if (wordKeys.length !== new Set(wordKeys).size) throw new Error("Vocabulary contains duplicate words");
  validation.vocabulary_words_unique = true;

  for (const record of vocabularyWords) {
    if (!record.gematria || !SYSTEMS.every((system) => Number.isInteger(record.gematria[system]))) {
      throw new Error(`Vocabulary word is missing gematria: ${record.word}`);
    }
    assertEnglishEqualsSimpleTimesSix(`vocabulary ${record.word}`, record.gematria);
  }
  validation.vocabulary_words_have_gematria = true;

  let lyricSongs = 0;
  for (const [index, song] of (data.songs || []).entries()) {
    const analysis = song.gematria_analysis;
    if (!analysis?.title?.gematria) throw new Error(`Song ${index} is missing title analysis`);
    assertEnglishEqualsSimpleTimesSix(`title ${song.title}`, analysis.title.gematria);

    if (analysis.lyrics?.available) {
      lyricSongs += 1;
      if (!analysis.lyrics.gematria) throw new Error(`Song ${song.title} is missing lyrics gematria`);
      assertEnglishEqualsSimpleTimesSix(`lyrics ${song.title}`, analysis.lyrics.gematria);

      const lineTotal = { jewish: 0, english: 0, simple: 0 };
      for (const line of analysis.lyrics.lines || []) {
        if (!line.gematria) throw new Error(`Line missing gematria in ${song.title}`);
        assertEnglishEqualsSimpleTimesSix(`line ${song.title} #${line.line_number}`, line.gematria);
        const wordSum = sumWordGematria(line.words || []);
        if (wordSum.jewish !== line.gematria.jewish || wordSum.english !== line.gematria.english || wordSum.simple !== line.gematria.simple) {
          throw new Error(`Line gematria does not equal word sum in ${song.title} #${line.line_number}`);
        }
        lineTotal.jewish += line.gematria.jewish;
        lineTotal.english += line.gematria.english;
        lineTotal.simple += line.gematria.simple;
      }

      if (lineTotal.jewish !== analysis.lyrics.gematria.jewish || lineTotal.english !== analysis.lyrics.gematria.english || lineTotal.simple !== analysis.lyrics.gematria.simple) {
        throw new Error(`Lyrics gematria does not equal line sum in ${song.title}`);
      }

      for (const section of analysis.lyrics.sections || []) {
        assertEnglishEqualsSimpleTimesSix(`section ${song.title} ${section.label}`, section.gematria);
        if (section.label && section.gematria.simple === gematriaValues(section.label).simple && section.word_count === tokenize(section.label).length) {
          throw new Error(`Section appears to include only its label in ${song.title}: ${section.label}`);
        }
      }

      if ((analysis.lyrics.sections || []).length === 0 && analysis.lyrics.section_detection !== "none") {
        throw new Error(`Fake section detection in ${song.title}`);
      }
    }
  }

  validation.all_songs_have_title_analysis = true;
  validation.lyric_songs_have_whole_lyrics_analysis = lyricSongs === data.gematria.songs_with_lyrics_analyzed;
  validation.usable_lyric_lines_have_gematria = true;
  validation.line_values_equal_word_sums = true;
  validation.english_equals_simple_times_six = true;
  validation.section_labels_excluded = true;
  validation.no_fake_sections = true;

  return validation;
}

function sampleVocabularyWords(data) {
  return (data.vocabulary.words || []).slice(0, 20).map((record) => ({
    word: record.word,
    gematria: record.gematria,
  }));
}

function printSummary({ stats, validation, sizeBefore, sizeAfter, sampleVocabulary }) {
  console.log("Gematria analysis complete");
  console.log(`Vocabulary words analyzed: ${stats.vocabularyWordsAnalyzed}`);
  console.log(`Songs analyzed: ${stats.songsAnalyzed}`);
  console.log(`Songs with lyrics: ${stats.songsWithLyrics}`);
  console.log(`Titles analyzed: ${stats.titlesAnalyzed}`);
  console.log(`Lyric lines analyzed: ${stats.lyricLines}`);
  console.log(`Explicit sections found: ${stats.explicitSections}`);
  console.log(`Songs with explicit sections: ${stats.songsWithExplicitSections}`);
  console.log(`Songs without explicit sections: ${stats.songsWithoutExplicitSections}`);
  console.log(`JSON size before: ${sizeBefore}`);
  console.log(`JSON size after: ${sizeAfter}`);

  console.log("\nValidation");
  for (const [key, value] of Object.entries(validation)) {
    console.log(`${key}: ${value ? "pass" : "fail"}`);
  }

  console.log("\nLikely non-song processing artifacts");
  for (const title of LIKELY_NON_SONG_ARTIFACTS) {
    console.log(title);
  }

  console.log("\n20 sample vocabulary words");
  for (const item of sampleVocabulary) {
    console.log(`${item.word}\t${item.gematria.jewish}\t${item.gematria.english}\t${item.gematria.simple}`);
  }

  console.log("\n10 sample song titles");
  for (const item of stats.sampleTitles) {
    console.log(`${item.title}\t${item.gematria.jewish}\t${item.gematria.english}\t${item.gematria.simple}`);
  }

  console.log("\n20 sample lyric lines");
  for (const item of stats.sampleLines) {
    console.log(`${item.song_title}\t${item.line_number}\t${item.text_preview}\t${item.gematria.jewish}\t${item.gematria.english}\t${item.gematria.simple}`);
  }

  console.log("\nSection-label summary");
  if (stats.sectionLabelCounts.size === 0) {
    console.log("No explicit section labels discovered.");
  } else {
    for (const [key, count] of [...stats.sectionLabelCounts.entries()].sort()) {
      const [type, label] = key.split("\t");
      console.log(`${type}\t${label}\t${count}`);
    }
  }
}

function main() {
  const inputPath = path.resolve(process.argv[2] || SONGS_IMPORT_PATH);
  const sizeBefore = fs.statSync(inputPath).size;

  if (!fs.existsSync(BACKUP_PATH)) {
    fs.copyFileSync(inputPath, BACKUP_PATH);
  }

  const data = loadJson(inputPath);
  const vocabularyWordsAnalyzed = addVocabularyGematria(data);
  const songStats = addSongGematria(data);
  const validation = validate(data);

  writeJsonAtomic(inputPath, data);
  loadJson(inputPath);

  const sizeAfter = fs.statSync(inputPath).size;
  printSummary({
    stats: {
      ...songStats,
      vocabularyWordsAnalyzed,
    },
    validation,
    sizeBefore,
    sizeAfter,
    sampleVocabulary: sampleVocabularyWords(data),
  });
}

main();
