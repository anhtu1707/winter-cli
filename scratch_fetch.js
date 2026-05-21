async function test() {
  try {
    await fetch('http://localhost:9999/chat');
  } catch (err) {
    console.log('NAME:', err.name);
    console.log('MESSAGE:', err.message);
    console.log('ABORT TEST:', /abort/i.test(String(err.message)));
  }
}
test();
