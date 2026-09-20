import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {once} from 'node:events';
import {handleAIRequest} from '../ai-api.js';
import {getAIConfig} from '../ai-provider.js';

test('custom provider serves all four AI routes; legacy configuration remains supported', async () => {
  const calls = [];
  const outputs = [
    {text_blocks: [{text: '题目'}], image_regions: [{x: 100, y: 200, w: 400, h: 400, confidence: .99}]},
    {blocks: [{index: 1, text: '求 $AB$'}]},
    {kind: 'diagram', content_bbox: {x: 0, y: 0, w: 1000, h: 1000}, semantic: {confidence: .99, source_label_count: 3, vertices: [{id: 'A', x: 100, y: 100}, {id: 'B', x: 800, y: 800}, {id: 'C', x: 100, y: 800}], edges: [{from: 'A', to: 'B'}, {from: 'B', to: 'C'}, {from: 'C', to: 'A'}]}},
    {textSize: 34, textY: 14, imageScale: 70, imageY: 58, lineWidth: 2, detail: 'clean', summary: '已调整'},
  ];
  const upstream = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    calls.push({url: req.url, key: req.headers.authorization, body: JSON.parse(Buffer.concat(chunks))});
    res.writeHead(200, {'content-type': 'application/json'});
    res.end(JSON.stringify({choices: [{message: {content: '```json\n' + JSON.stringify(outputs[calls.length - 1]) + '\n```'}}]}));
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  try {
    const env = {AI_API_KEY: 'local-test-key', AI_BASE_URL: `http://127.0.0.1:${upstream.address().port}/custom/v1/`, AI_VISION_MODEL: 'custom-vision', AI_TEXT_MODEL: 'custom-text'};
    const image = 'data:image/png;base64,dGVzdA==';
    const bodies = [{image}, {images: [image]}, {image}, {prompt: '文字 34 号'}];
    const results = [];
    for (const [i, route] of ['analyze', 'ocr', 'image', 'personalize'].entries()) {
      const response = await handleAIRequest(new Request(`http://localhost/api/ai/${route}`, {method: 'POST', body: JSON.stringify(bodies[i])}), env);
      assert.equal(response.status, 200);
      const result = await response.json();
      assert(!JSON.stringify(result).includes('local-test-key'));
      results.push(result);
    }
    assert.equal(results[0].text_blocks[0].text, '题目');
    assert.equal(results[1].blocks[0].text, '求 $AB$');
    assert.equal(results[2].semantic.vertices.length, 3);
    assert.equal(results[3].textSize, 34);
    assert.deepEqual(calls.map(c => c.body.model), ['custom-vision', 'custom-vision', 'custom-vision', 'custom-text']);
    for (const call of calls) {
      assert.equal(call.url, '/custom/v1/chat/completions');
      assert.equal(call.key, 'Bearer local-test-key');
    }
    assert.equal(calls[0].body.messages[1].content[0].image_url.url, image);
    assert.equal(calls[1].body.messages[1].content[0].image_url.url, image);
    assert.equal(calls[2].body.messages[1].content[0].image_url.url, image);
    assert.equal(typeof calls[3].body.messages[1].content, 'string');
    assert.deepEqual(getAIConfig({SILICONFLOW_API_KEY: 'legacy', SILICONFLOW_BASE_URL: 'https://legacy.example/v1', SILICONFLOW_VISION_MODEL: 'legacy-model'}), {apiKey: 'legacy', baseURL: 'https://legacy.example/v1', visionModel: 'legacy-model', textModel: 'legacy-model'});
    assert.equal(getAIConfig({...env, SILICONFLOW_API_KEY: 'legacy'}).apiKey, 'local-test-key');
    const missing = await handleAIRequest(new Request('http://localhost/api/ai/analyze', {method: 'POST', body: JSON.stringify({image})}), {});
    assert.equal(missing.status, 502);
    assert.match((await missing.json()).error, /未配置/);
  } finally {
    upstream.closeAllConnections();
    await new Promise(resolve => upstream.close(resolve));
  }
});
