import { lookup } from 'node:dns/promises';
import { createWriteStream } from 'node:fs';
import { request } from 'node:https';
import { BlockList } from 'node:net';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import env from '../config/env.js';
import { AppError } from '../middleware/error.middleware.js';
import { validateImageUrl } from './image.service.js';

const privateRanges = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
]) privateRanges.addSubnet(address, prefix);

function openImage(url, address, signal) {
  return new Promise((resolve, reject) => {
    const req = request(url, {
      agent: false,
      signal,
      family: 4,
      // Keep the verified IP pinned while TLS still verifies the original host.
      lookup: (_hostname, options, done) => {
        if (options.all) done(null, [{ address, family: 4 }]);
        else done(null, address, 4);
      },
      headers: { Accept: 'image/*' },
    }, resolve);
    req.on('error', reject);
    req.end();
  });
}

export async function downloadLinkedImage(input, destination, signal = AbortSignal.timeout(12000)) {
  try {
    let source = input;
    for (let redirects = 0; redirects <= 3; redirects++) {
      const url = new URL(validateImageUrl(source).url);
      if (url.port) throw new AppError('Use the standard HTTPS port for image links', 400);
      const addresses = await lookup(url.hostname, { family: 4, all: true });
      if (!addresses.length || addresses.some(({ address }) => privateRanges.check(address))) {
        throw new AppError('Use a public HTTPS image URL', 400);
      }

      const response = await openImage(url, addresses[0].address, signal);
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        response.destroy();
        if (!response.headers.location || redirects === 3) break;
        source = new URL(response.headers.location, url).href;
        continue;
      }
      if (response.statusCode !== 200) {
        response.destroy();
        throw new AppError('The image link could not be opened. Use a direct image URL or upload a file.', 422);
      }
      if (Number(response.headers['content-length']) > env.MEDIA_MAX_FILE_SIZE) {
        response.destroy();
        throw new AppError('Linked image exceeds the upload limit', 413);
      }
      let size = 0;
      const limit = new Transform({
        transform(chunk, _encoding, callback) {
          size += chunk.length;
          if (size > env.MEDIA_MAX_FILE_SIZE) callback(new AppError('Linked image exceeds the upload limit', 413));
          else callback(null, chunk);
        },
      });
      await pipeline(response, limit, createWriteStream(destination, { flags: 'wx' }), { signal });
      return { path: destination, originalname: 'linked image', size };
    }
    throw new AppError('The image link redirects too many times', 422);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('The image link could not be opened. Use a direct image URL or upload a file.', 422);
  }
}
