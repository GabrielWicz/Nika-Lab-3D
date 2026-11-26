import { randomUUID } from 'node:crypto';
import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';

const directory = new URL('../catalogo/', import.meta.url);
const listFile = new URL('produtos-adicionados.js', directory);
const prefix = 'const produtosAdicionados = ';
const categories = ['Empresas', 'Brinquedos', 'Presentes', 'Utensílios', 'Natal'];

function photo(value) {
  const match = typeof value === 'string' && /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return;
  const [, type, encoded] = match;
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length > 5_000_000 || bytes.toString('base64') !== encoded) return;
  const valid = {
    png: bytes.subarray(0, 8).toString('hex') === '89504e470d0a1a0a',
    jpeg: bytes.subarray(0, 3).toString('hex') === 'ffd8ff',
    webp: bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
  };
  if (valid[type]) return { bytes, extension: type === 'jpeg' ? 'jpg' : type };
}

export function addCatalogProduct(input) {
  const { cat, sub, name, desc, photos } = input ?? {};
  const fields = [[name, 160], [sub, 100], [desc, 1000]];
  if (!categories.includes(cat) || fields.some(([value, limit]) =>
    typeof value !== 'string' || !value.trim() || value.trim().length > limit)) {
    return 'Confira o nome, a categoria, a subcategoria e a descrição.';
  }
  if (!Array.isArray(photos) || photos.length > 5) return 'Envie até cinco fotos.';
  const images = photos.map(photo);
  if (images.some(image => !image)) return 'Use fotos PNG, JPEG ou WebP de até 5 MB cada.';

  const products = JSON.parse(readFileSync(listFile, 'utf8').trim().slice(prefix.length, -1));
  const id = randomUUID();
  const product = { cat, sub: sub.trim(), name: name.trim(), desc: desc.trim(), images: [] };
  const temporary = new URL('produtos-' + id + '.tmp', directory);
  const created = [];
  try {
    images.forEach(({ bytes, extension }, index) => {
      const path = 'assets/produto-' + id + '-' + (index + 1) + '.' + extension;
      const file = new URL(path, directory);
      created.push(file);
      writeFileSync(file, bytes);
      product.images.push(path);
    });
    products.push(product);
    writeFileSync(temporary, prefix + JSON.stringify(products, null, 2) + ';\n');
    renameSync(temporary, listFile);
  } catch (error) {
    for (const file of [...created, temporary]) rmSync(file, { force: true });
    throw error;
  }
}
