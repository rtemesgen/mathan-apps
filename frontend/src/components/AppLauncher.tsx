import { ArrowRight, CheckCircle2, Share2, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ERP_APPS } from '../appRegistry';
import { shareApp } from '../lib/mobile';

export function AppLauncher() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-20">
      <section className="max-w-2xl">
        <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest text-emerald-800">
          <Sparkles className="h-3 w-3" /> Your workspace
        </div>
        <h1 className="font-serif text-4xl font-bold tracking-tight text-zinc-900 sm:text-6xl">Choose an app to get started.</h1>
        <p className="mt-4 max-w-xl text-sm leading-6 text-zinc-500 sm:text-base">Mathan ERP brings focused business tools into one workspace. Each app keeps its own records and accounting logic.</p>
        <button onClick={() => void shareApp()} className="mt-5 inline-flex items-center gap-2 rounded-xl border border-[#e6e2d6] bg-white px-3 py-2 text-xs font-bold text-zinc-800 shadow-sm hover:border-zinc-300"><Share2 className="h-4 w-4" /> Share app</button>
      </section>
      <section className="mt-10 grid gap-4 md:grid-cols-2">
        {ERP_APPS.map((app) => {
          const Icon = app.icon;
          return (
            <Link key={app.id} to={app.route} className="group rounded-3xl border border-[#e6e2d6] bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-lg sm:p-7">
              <div className="flex items-start justify-between">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-900 text-white"><Icon className="h-6 w-6" /></div>
                <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-extrabold uppercase tracking-wider text-emerald-700"><CheckCircle2 className="h-3 w-3" /> Available</span>
              </div>
              <h2 className="mt-8 font-serif text-2xl font-bold text-zinc-900">{app.name}</h2>
              <p className="mt-2 min-h-12 text-sm leading-6 text-zinc-500">{app.description}</p>
              <span className="mt-7 inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-zinc-900">Open app <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></span>
            </Link>
          );
        })}
      </section>
    </main>
  );
}
