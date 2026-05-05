import { ShieldCheck, LockKeyhole, CreditCard } from 'lucide-react';
import { FeatureCard } from '../components/feature-card';

const features = [
  {
    title: 'Device-bound licensing',
    description: 'Issue licenses that pair entitlement state with machine identity signals.',
    icon: ShieldCheck,
  },
  {
    title: 'Secure vault delivery',
    description: 'Protect project assets with encrypted download flows and short-lived access.',
    icon: LockKeyhole,
  },
  {
    title: 'Payment enforcement',
    description: 'Connect Stripe and Razorpay events to product access without manual reviews.',
    icon: CreditCard,
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-16">
      <section className="flex flex-1 flex-col justify-center">
        <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300">
          FCPro Vault
        </p>
        <h1 className="mt-6 max-w-4xl text-5xl font-bold tracking-tight text-white sm:text-7xl">
          License enforcement infrastructure for premium digital products.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-300">
          FCPro Vault gives creators a secure control plane for keys, payments,
          projects, and device activation from one operational dashboard.
        </p>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {features.map((feature) => (
            <FeatureCard key={feature.title} {...feature} />
          ))}
        </div>
      </section>
    </main>
  );
}
