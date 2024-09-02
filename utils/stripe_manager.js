require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_KEY);

const credits = [
    {
        "package_number": 1,
        "price_id": "price_1PuTy72MV6hKm3ONPGGbO3CO",
        "credits": 8000000
    },
    {
        "package_number": 2,
        "price_id": "price_1PuTyd2MV6hKm3ONpQt6cA1Q",
        "credits": 16000000
    },
    {
        "package_number": 3,
        "price_id": "price_1PuTzF2MV6hKm3ONSEB4T6n1",
        "credits": 32000000
    }
]

async function createSession(email, price_id) {
    const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        line_items: [
            {
                price: price_id,
                quantity: 1,
            },
        ],
        discounts: [
            {
                coupon: 'bMKfHimo',
                //coupon: 'CJghsOBc'
            },
        ],
        customer_email: email,
        success_url: process.env.FRONTEND_URL + 'chat?session_id={CHECKOUT_SESSION_ID}',
        subscription_data: {
            trial_settings: {
                end_behavior: {
                    missing_payment_method: 'cancel',
                },
            },
            trial_period_days: 2,
        },
    });

    return session.url
}

async function createPortal(customer_id) {
    const portalSession = await stripe.billingPortal.sessions.create({
        customer: customer_id,
        return_url: process.env.FRONTEND_URL,
    });

    return portalSession.url
}

async function buyCredits(package_number, email) {
    // Find the price ID for the given package number
    const creditPackage = credits.find(credit => credit.package_number === package_number);
    console.log(creditPackage);
    if (!creditPackage) {
        throw new Error('Invalid package number');
    }

    const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [
            {
                price: creditPackage.price_id,
                quantity: 1,
            },
        ],
        customer_email: email,
        success_url: process.env.FRONTEND_URL + 'profile?session_id={CHECKOUT_SESSION_ID}',
        metadata: {
            credits: creditPackage.credits
        }
    });

    return session.url;
}

module.exports = {
    createSession,
    createPortal,
    buyCredits,
    credits
}