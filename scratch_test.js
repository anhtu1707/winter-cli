import { AIProviderManager } from './src/ai/providers.js';
import { ConfigManager } from './src/config/manager.js';

async function test() {
  const config = new ConfigManager(process.cwd());
  const ai = new AIProviderManager(config);
  await ai.init();
  console.log('Active provider:', ai.activeProvider);
  const providerConfig = ai.providers[ai.activeProvider];
  console.log('Provider config:', providerConfig);

  try {
    const stream = ai.streamRequest([{ role: 'user', content: 'alo' }]);
    for await (const chunk of stream) {
      console.log('CHUNK:', chunk.content);
    }
    console.log('DONE');
  } catch (err) {
    console.log('ERROR:', err.message, err.status);
  }
}

test().catch(console.error);
