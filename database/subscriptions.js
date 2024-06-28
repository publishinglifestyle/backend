require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_API_KEY);

async function createSubscription(name, description, level, price_id, price, credits) {
    const { data, error } = await supabase
        .from('Subscriptions')
        .insert([
            { name, description, level, price_id, price, credits },
        ])
        .select()

    return { data, error }
}

async function updateSubscription(subscription_id, name, description, level, price_id, price, credits) {
    try {
        const { data: existingData } = await supabase
            .from('Subscriptions')
            .select()
            .match({ id: subscription_id })
            .single();

        if (existingData) {
            const { data, error: updateError } = await supabase
                .from('Subscriptions')
                .update({ name, description, level, price_id, price, credits })
                .select()
                .match({ id: subscription_id })

            if (updateError) {
                throw updateError;
            }
            return { data, error: null };

        } else {
            return { error: "Subscription not found" }
        }

    } catch (error) {
        console.error('Error updating subscription:', error);
        return { error };
    }
}

async function getSubscription(subscription_id) {
    try {
        const { data, error } = await supabase
            .from('Subscriptions')
            .select()
            .match({ id: subscription_id })
            .single();

        if (error) {
            throw error;
        }

        return { data, error }
    } catch (error) {
        console.error('Failed to retrieve subscription:', error);
        return { error }
    }
}

async function getSubscriptionByPriceId(price_id) {
    try {
        const { data, error } = await supabase
            .from('Subscriptions')
            .select()
            .match({ price_id })
            .single();

        if (error) {
            throw error;
        }

        return { data, error }
    } catch (error) {
        console.error('Failed to retrieve subscription:', error);
        return { error }
    }
}

async function getSubscriptions() {
    try {
        const { data, error } = await supabase
            .from('Subscriptions')
            .select()

        if (error) {
            throw error;
        }

        return { data, error }
    } catch (error) {
        console.error('Failed to retrieve subscriptions:', error);
        return { error }
    }
}

async function deleteSubscription(subscription_id) {
    const { data, error } = await supabase
        .from('Subscriptions')
        .delete()
        .match({ id: subscription_id });

    return { data, error };
}

async function assignSubscription(user_id, price_id) {
    const { data, error } = await supabase
        .from('Users')
        .update({ price_id })
        .match({ id: user_id })
        .select()
        .single();

    return { data, error };
}

module.exports = {
    createSubscription,
    updateSubscription,
    getSubscription,
    getSubscriptions,
    deleteSubscription,
    assignSubscription,
    getSubscriptionByPriceId
}