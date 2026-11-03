'use client';
import dynamic from 'next/dynamic';

const Map = dynamic(() => import('./LeafletMap'), {
  ssr: false,
  loading: () => <div style={{ width: '100%', height: '100%', minHeight: 240, background: '#EFE6D8' }} />,
});

export default Map;
