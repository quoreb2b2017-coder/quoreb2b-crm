'use client';

import dynamic from 'next/dynamic';

const MasterDataUploadPanel = dynamic(
  () =>
    import('@/components/admin/MasterDataUploadPanel').then((m) => ({
      default: m.MasterDataUploadPanel,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
        Loading master data upload…
      </div>
    ),
  },
);

export default function MasterDataUploadPage() {
  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <MasterDataUploadPanel />
    </div>
  );
}
