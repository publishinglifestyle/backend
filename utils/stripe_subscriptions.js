require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_KEY);

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
                coupon: 'AcelvjAW',
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

module.exports = {
    createSession,
    createPortal
}