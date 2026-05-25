#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse/sync');
const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
const serviceAccountPath = path.join(process.cwd(), 'lib', 'serviceAccountKey.json');

if (!fs.existsSync(serviceAccountPath)) {
  console.error('❌ Error: serviceAccountKey.json not found at lib/serviceAccountKey.json');
  console.error('Please download your Firebase service account key from the Firebase Console:');
  console.error('1. Go to Firebase Console > Project Settings > Service Accounts');
  console.error('2. Click "Generate New Private Key"');
  console.error('3. Save it as lib/serviceAccountKey.json');
  process.exit(1);
}

const serviceAccount = require(serviceAccountPath);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// Configuration for each CSV file
const configs = [
  {
    name: 'Clients',
    filePath: 'C:\\Users\\noble.nelson\\Desktop\\Mediabox APP files 2026\\Mediabox_Forecaster_source_-_Clients.csv.csv',
    collection: 'clients',
    idField: 'CL_ID',
  },
  {
    name: 'Forecast',
    filePath: 'C:\\Users\\noble.nelson\\Desktop\\Mediabox APP files 2026\\Mediabox_Forecaster_source_-_Forecast.csv.csv',
    collection: 'forecasts',
    idField: 'FO_ID',
  },
  {
    name: 'Commissions',
    filePath: 'C:\\Users\\noble.nelson\\Desktop\\Mediabox APP files 2026\\Mediabox_Forecaster_source_-_Commissions.csv.csv',
    collection: 'commissions',
    idField: 'CO_ID',
  },
  {
    name: 'Client Access',
    filePath: 'C:\\Users\\noble.nelson\\Desktop\\Mediabox APP files 2026\\Mediabox_Forecaster_source_-_Client_Access.csv.csv',
    collection: 'access',
    idField: null, // Will generate document ID if no field specified
  },
];

const BATCH_SIZE = 500;

/**
 * Read and parse CSV file
 */
function readCsvFile(filePath) {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const records = parse(fileContent, {
      columns: true,
      skip_empty_lines: true,
    });
    return records;
  } catch (error) {
    console.error(`❌ Error reading file ${filePath}:`, error.message);
    return [];
  }
}

/**
 * Upload data to Firestore in batches
 */
async function uploadToFirestore(config, records) {
  if (records.length === 0) {
    console.log(`⚠️  No records found in ${config.name}`);
    return;
  }

  console.log(`\n📥 Uploading ${config.name}... (${records.length} total records)`);

  let uploadedCount = 0;

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const batchRecords = records.slice(i, i + BATCH_SIZE);

    for (const record of batchRecords) {
      let docId;

      if (config.idField && record[config.idField]) {
        docId = String(record[config.idField]).trim();
      } else {
        docId = db.collection(config.collection).doc().id;
      }

      const docRef = db.collection(config.collection).doc(docId);
      batch.set(docRef, record);
    }

    try {
      await batch.commit();
      uploadedCount += batchRecords.length;
      console.log(`   ✓ ${config.name}: ${uploadedCount}/${records.length} done`);
    } catch (error) {
      console.error(`❌ Error uploading batch for ${config.name}:`, error.message);
      process.exit(1);
    }
  }

  console.log(`✅ ${config.name} uploaded successfully!`);
}

/**
 * Main function to process all CSVs
 */
async function main() {
  console.log('🚀 Starting Firestore import...\n');

  for (const config of configs) {
    console.log(`📂 Processing ${config.name}...`);

    // Check if file exists
    if (!fs.existsSync(config.filePath)) {
      console.error(`❌ File not found: ${config.filePath}`);
      process.exit(1);
    }

    const records = readCsvFile(config.filePath);
    await uploadToFirestore(config, records);
  }

  console.log('\n✨ All imports completed!');
  process.exit(0);
}

// Run the main function
main().catch((error) => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
