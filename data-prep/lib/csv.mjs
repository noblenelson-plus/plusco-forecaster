// filepath: data-prep/lib/csv.mjs

/**
 * Minimal RFC 4180 CSV reader for the Maconomy exports.
 *
 * The hours files have embedded newlines stripped (one record per line), and the
 * SSRS gross-revenue exports never wrap lines, so records are read line by line
 * and each line is split with a quote-aware parser. Streaming keeps the 70 MB
 * hours files out of memory.
 */

import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

/** Splits one CSV line into fields, honouring "quoted, fields" and "" escapes. */
export function splitCsvLine(line) {
  const out = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(field);
      field = "";
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out;
}

/**
 * Streams a CSV file and calls `onRow(record, lineNo)` for every data row,
 * where `record` maps header → raw string. Returns { header, rows }.
 */
export async function readCsv(path, onRow) {
  const rl = createInterface({
    input: createReadStream(path, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  let header = null;
  let rows = 0;
  let lineNo = 0;
  for await (const raw of rl) {
    lineNo++;
    const line = lineNo === 1 ? raw.replace(/^﻿/, "") : raw;
    if (line.trim() === "") continue;
    const fields = splitCsvLine(line);
    if (!header) {
      header = fields;
      continue;
    }
    if (fields.length !== header.length) {
      throw new Error(
        `${path}:${lineNo} has ${fields.length} fields, header has ${header.length}`
      );
    }
    const rec = {};
    for (let i = 0; i < header.length; i++) rec[header[i]] = fields[i];
    rows++;
    onRow(rec, lineNo);
  }
  return { header, rows };
}
