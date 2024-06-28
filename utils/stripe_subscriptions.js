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
        customer_email: email,
        success_url: process.env.FRONTEND_URL + 'chat?session_id={CHECKOUT_SESSION_ID}'
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