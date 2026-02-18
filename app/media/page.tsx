import { MediaGallery } from '../../components/MediaGallery';

export const metadata = {
  title: 'Oliver JW - Media',
};

export default function MediaPage() {
  return (
    <main>
      <h1>Media</h1>
      <p>
        <em>places, people, and things over the years</em>
      </p>
      <MediaGallery />
    </main>
  );
}
