
import { sql } from 'drizzle-orm';
import { db } from '@/core/db';

async function checkColumn() {
  console.log('Checking DB connection and schema...');
  try {
    const [dbInfo] = await db().execute(sql`SELECT current_database(), current_schema(), inet_server_addr(), inet_server_port();`);
    console.log('Connected to:', dbInfo);

    const tables = await db().execute(sql`
      SELECT table_schema, table_name 
      FROM information_schema.tables 
      WHERE table_name = 'user';
    `);
    console.log('Found "user" tables:', tables);

    const result = await db().execute(sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'user' AND column_name = 'unlimited_credits';
    `);
    
    console.log('Column Check Result:', result);
    
    if (result.length > 0) {
      console.log('✅ Column unlimited_credits EXISTS.');
    } else {
      console.log('❌ Column unlimited_credits DOES NOT EXIST.');
    }
  } catch (e) {
    console.error('Error querying DB:', e);
  }
  process.exit(0);
}

checkColumn();
