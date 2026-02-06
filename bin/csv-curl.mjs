#!/usr/bin/env node

import { createReadStream, readFileSync } from "fs";
import { resolve } from "path";
import csvParser from "csv-parser";

function parseCsvFile(filePath) {
  return new Promise((resolve, reject) => {
    const records = [];
    createReadStream(filePath)
      .pipe(csvParser({ mapValues: ({ value }) => value.trim() }))
      .on("data", (row) => records.push(row))
      .on("end", () => resolve(records))
      .on("error", reject);
  });
}

function applyTemplate(template, record) {
  return walk(structuredClone(template));

  function walk(node) {
    if (Array.isArray(node)) {
      return node.map(walk);
    }
    if (node !== null && typeof node === "object") {
      for (const key of Object.keys(node)) {
        node[key] = walk(node[key]);
      }
      return node;
    }
    if (typeof node === "string") {
      const exactMatch = node.match(/^\{\{(\w+)\}\}$/);
      if (exactMatch) {
        return record[exactMatch[1]] !== undefined
          ? record[exactMatch[1]]
          : node;
      }
      return node.replace(/\{\{(\w+)\}\}/g, (_, key) =>
        record[key] !== undefined ? record[key] : `{{${key}}}`
      );
    }
    return node;
  }
}

async function main() {
  const [csvPath, templatePath, url] = process.argv.slice(2);

  if (!csvPath || !templatePath || !url) {
    console.error("Usage: csv-curl <file.csv> <template.json> <url>");
    process.exit(1);
  }

  let records;
  try {
    records = await parseCsvFile(resolve(csvPath));
  } catch (err) {
    console.error(`Error reading CSV file: ${err.message}`);
    process.exit(1);
  }

  let template;
  try {
    const raw = readFileSync(resolve(templatePath), "utf-8");
    template = JSON.parse(raw);
  } catch (err) {
    console.error(`Error reading template file: ${err.message}`);
    process.exit(1);
  }

  if (records.length === 0) {
    console.log("No data rows found in CSV.");
    process.exit(0);
  }

  console.log(`Sending ${records.length} request(s) to ${url}\n`);

  let hasFailure = false;

  for (let i = 0; i < records.length; i++) {
    const body = JSON.stringify(applyTemplate(template, records[i]));
    console.log(`--- Row ${i + 1} ---`);
    console.log(`POST ${url}`);
    console.log(`Body: ${body}`);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });

      const text = await response.text();
      console.log(`Status: ${response.status}`);
      console.log(`Response: ${text}\n`);

      if (!response.ok) {
        hasFailure = true;
      }
    } catch (err) {
      console.error(`Request failed: ${err.message}\n`);
      hasFailure = true;
    }
  }

  if (hasFailure) {
    process.exit(1);
  }
}

main();
