'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import toast from 'react-hot-toast';
import { getApiError, paymentApi, Plan } from '../../lib/api';

interface BuyerInfo {
  email: string;
  name: string;
}

interface RazorpayInstanceOptions {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  order_id: string;
  prefill: BuyerInfo;
  notes: Record<string, string>;
  handler: (response: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) => void | Promise<void>;
  modal: {
    ondismiss: () => void;
  };
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayInstanceOptions) => {
      open: () => void;
    };
  }
}

const plans: Array<{
  id: Plan;
  name: string;
  price: string;
  devices: string;
  popular?: boolean;
  features: Array<{ text: string; included: boolean }>;
}> = [
  {
    id: 'standard',
    name: 'Standard',
    price: '₹1,999',
    devices: '2 devices',
    features: [
      { text: 'Core FCP project library', included: true },
      { text: 'AES-256 protected downloads', included: true },
      { text: 'Priority releases', included: false },
      { text: 'Team seat support', included: false },
    ],
  },
  {
    id: 'professional',
    name: 'Professional',
    price: '₹3,999',
    devices: '3 devices',
    popular: true,
    features: [
      { text: 'Everything in Standard', included: true },
      { text: 'Professional project bundles', included: true },
      { text: 'Priority releases', included: true },
      { text: 'Team seat support', included: false },
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: '₹7,999',
    devices: '10 devices',
    features: [
      { text: 'Everything in Professional', included: true },
      { text: 'Enterprise library access', included: true },
      { text: 'Priority releases', included: true },
      { text: 'Team seat support', included: true },
    ],
  },
];

function loadRazorpayScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Unable to load Razorpay checkout'));
    document.body.appendChild(script);
  });
}

export default function PricingPage() {
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [buyer, setBuyer] = useState<BuyerInfo>({ email: '', name: '' });
  const [loadingPlan, setLoadingPlan] = useState<Plan | null>(null);

  async function startCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (selectedPlan === null) {
      return;
    }

    setLoadingPlan(selectedPlan);

    try {
      await loadRazorpayScript();
      const order = await paymentApi.createRazorpayOrder({
        plan: selectedPlan,
        email: buyer.email,
        name: buyer.name,
      });

      const checkout = new window.Razorpay!({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: 'FCPro Vault',
        description: `${selectedPlan} license`,
        order_id: order.orderId,
        prefill: buyer,
        notes: {
          plan: selectedPlan,
          email: buyer.email,
          name: buyer.name,
        },
        handler: async (response) => {
          await paymentApi.verifyPayment({
            ...response,
            plan: selectedPlan,
            email: buyer.email,
            name: buyer.name,
          });
          toast.success('Payment verified. Your license will arrive shortly.');
          window.location.href = '/register';
        },
        modal: {
          ondismiss: () => setLoadingPlan(null),
        },
      });

      checkout.open();
      setSelectedPlan(null);
    } catch (error) {
      toast.error(getApiError(error));
    } finally {
      setLoadingPlan(null);
    }
  }

  return (
    <main>
      <nav className="nav">
        <Link href="/" className="brand">
          <span className="brand-mark">F</span>
          FCPro Vault
        </Link>
        <Link href="/login" className="btn btn-outline">
          Sign in
        </Link>
      </nav>
      <section className="section">
        <div className="section-heading fade-up">
          <span className="eyebrow">Simple pricing</span>
          <h1>Choose your vault access.</h1>
          <p>
            Every plan includes encrypted delivery, short-lived downloads, and
            hardware-bound activation.
          </p>
        </div>

        <div className="pricing-grid">
          {plans.map((plan) => (
            <article
              key={plan.id}
              className={`card price-card ${plan.popular ? 'price-card-popular' : ''}`}
            >
              {plan.popular ? <span className="badge badge-amber">Most Popular</span> : null}
              <h2>{plan.name}</h2>
              <div className="price">{plan.price}</div>
              <p className="muted">{plan.devices}</p>
              <ul className="feature-list">
                {plan.features.map((feature) => (
                  <li
                    key={feature.text}
                    className={feature.included ? 'feature-included' : 'feature-muted'}
                  >
                    <span>{feature.included ? '✓' : '✗'}</span>
                    {feature.text}
                  </li>
                ))}
              </ul>
              <button
                className={plan.popular ? 'btn btn-amber full' : 'btn btn-outline full'}
                onClick={() => setSelectedPlan(plan.id)}
                disabled={loadingPlan === plan.id}
              >
                {loadingPlan === plan.id ? <span className="spinner" /> : 'Buy now'}
              </button>
            </article>
          ))}
        </div>
        <p className="trust-line">
          Trusted checkout powered by Razorpay. Licenses are issued by verified
          payment webhooks.
        </p>
      </section>

      {selectedPlan ? (
        <div className="modal-backdrop" role="presentation">
          <form className="modal card" onSubmit={startCheckout}>
            <h2>Complete checkout</h2>
            <p className="muted">Enter the buyer details for your license.</p>
            <label>
              Name
              <input
                className="input"
                required
                maxLength={100}
                value={buyer.name}
                onChange={(event) =>
                  setBuyer((current) => ({ ...current, name: event.target.value }))
                }
              />
            </label>
            <label>
              Email
              <input
                className="input"
                required
                type="email"
                value={buyer.email}
                onChange={(event) =>
                  setBuyer((current) => ({ ...current, email: event.target.value }))
                }
              />
            </label>
            <div className="modal-actions">
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => setSelectedPlan(null)}
              >
                Cancel
              </button>
              <button className="btn btn-amber" type="submit">
                Continue
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}
