import ExtratorApp from '@/components/ExtratorApp';
import { Toaster } from '@/components/ui/sonner';

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50">
      <ExtratorApp />
      <Toaster />
    </main>
  );
}
