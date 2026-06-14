import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(here, '..', 'timeline-schema.sql');
const databaseUrl = process.env.LUMA_CONSOLE_DATABASE_URL || process.env.DATABASE_URL;

if (!databaseUrl) {
	console.error(
		'LUMA_CONSOLE_DATABASE_URL or DATABASE_URL is required. Point it at the Luma console Postgres database.'
	);
	process.exit(1);
}

const sql = postgres(databaseUrl, {
	max: 1,
	idle_timeout: 5,
	connect_timeout: 20,
	prepare: false
});

try {
	const schema = await readFile(schemaPath, 'utf8');
	await sql.begin(async (transaction) => {
		await transaction.unsafe(schema);
	});
	console.info('Applied Luma console timeline schema.');
} finally {
	await sql.end();
}
