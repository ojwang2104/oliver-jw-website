import { MediaGallery } from '../../components/MediaGallery';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

export const metadata = {
  title: 'Oliver JW - Media',
};
export const dynamic = 'force-dynamic';

export default function MediaPage() {
  const mediaDir = join(process.cwd(), 'public', 'images');
  const excludedFiles = new Set(['oliver.jpg', 'pepe.png']);
  const imageFiles = readdirSync(mediaDir)
    .filter((file) => /\.(jpe?g|png|webp)$/i.test(file) && !excludedFiles.has(file))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  return (
    <main>
      <h1>Media</h1>
      <p>
        <em>places, people, and things over the years</em>
      </p>
      <MediaGallery imageFiles={imageFiles} />
    </main>
  );
}
