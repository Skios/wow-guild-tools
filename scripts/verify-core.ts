import axios from 'axios';
import { prisma } from '../src/config/db.js';

const auth = { headers: { 'x-api-key': process.env.API_KEY ?? '' } };

async function runVerification() {
  console.log('🧪 Starting Core Engine Verification...');

  try {
    // 1. Setup: Create Dummy User and Character
    console.log('Creating dummy data...');
    const identity = await prisma.identity.upsert({
      where: { platform_platformUserId: { platform: 'telegram', platformUserId: '123456789' } },
      update: {},
      create: {
        platform: 'telegram',
        platformUserId: '123456789',
        user: { create: { username: 'RaidLeader_Test' } },
      },
      include: { user: true },
    });
    const user = identity.user;

    const character = await prisma.character.create({
      data: {
        userId: user.id,
        name: 'TestWarrior' + Math.floor(Math.random() * 1000),
        realm: 'Silvermoon',
        isMain: true,
      },
    });

    console.log(`✅ Created User: ${user.username} (${user.id})`);
    console.log(`✅ Created Character: ${character.name}`);

    // 2. Test Event Creation
    console.log('\nTesting Event Creation...');
    const eventPayload = {
      title: 'Mythic Raid Night',
      startTime: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
      endTime: new Date(Date.now() + 86400000 + 14400000).toISOString(), // +4 hours
      description: 'Testing the core engine',
      createdByUserId: user.id,
    };

    const createRes = await axios.post('http://localhost:3000/events', eventPayload, auth);
    const eventId = createRes.data.id;
    console.log(`✅ Event Created! ID: ${eventId}`);

    // 3. Test Event Retrieval
    console.log('\nTesting Event Retrieval...');
    const getRes = await axios.get(`http://localhost:3000/events/${eventId}`, auth);
    if (getRes.data.title === eventPayload.title) {
      console.log(`✅ Event retrieved correctly: ${getRes.data.title}`);
    } else {
      throw new Error('Retrieved event title mismatch');
    }

    // 4. Test Event Listing
    console.log('\nTesting Event Listing...');
    const listRes = await axios.get('http://localhost:3000/events', auth);
    if (listRes.data.length > 0) {
      console.log(`✅ Events listed. Found ${listRes.data.length} events.`);
    } else {
      throw new Error('Event list is empty');
    }

    console.log('\n✨ CORE ENGINE VALIDATED SUCCESSFULLY ✨');
  } catch (error: any) {
    console.error('\n❌ Verification Failed:');
    console.error(error.response?.data || error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runVerification();
