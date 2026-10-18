import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
export function secretBox(keys, current) {
  const ring = Object.fromEntries(Object.entries(keys).map(([version, value]) => [version, Buffer.from(value, 'base64')]));
  if (!ring[current] || Object.values(ring).some(key => key.length !== 32)) throw Error('Invalid server encryption configuration');
  const aad = (owner, id, version) => Buffer.from(JSON.stringify(['lifecommand-live-ics', owner, id, version]));
  return {
    seal(value, owner, id) {
      const nonce = randomBytes(12), cipher = createCipheriv('aes-256-gcm', ring[current], nonce);
      cipher.setAAD(aad(owner, id, current));
      const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
      return { version: current, nonce: nonce.toString('base64'), ciphertext: ciphertext.toString('base64'), tag: cipher.getAuthTag().toString('base64') };
    },
    open(value, owner, id) {
      const decipher = createDecipheriv('aes-256-gcm', ring[value.version], Buffer.from(value.nonce, 'base64'));
      decipher.setAAD(aad(owner, id, value.version)); decipher.setAuthTag(Buffer.from(value.tag, 'base64'));
      return Buffer.concat([decipher.update(Buffer.from(value.ciphertext, 'base64')), decipher.final()]).toString('utf8');
    },
  };
}
