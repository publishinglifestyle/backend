require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_API_KEY);

async function createSubscription(subscription_id, customer_id, user_id, is_active, credits) {
    const context = []
    const { data, error } = await supabase
        .from('UserSubscriptions')
        .insert([
            { subscription_id, customer_id, user_id, is_active, credits },
        ])
        .select()

    return { data, error }
}

async function updateSubscription(user_id, customer_id, is_active, credits) {
    const query = credits ? { is_active, credits, customer_id } : { is_active, customer_id };
    console.log(query)
    try {
        const { data, error: updateError } = await supabase
            .from('UserSubscriptions')
            .update(query)
            .select()
            .match({ user_id: user_id })

        if (updateError) {
            throw updateError;
        }
        return { data, error: null };

    } catch (error) {
        console.error('Error updating subscription:', error);
        return { error };
    }
}

async function updateCredits(user_id, credits) {
    try {
        const { data, error: updateError } = await supabase
            .from('UserSubscriptions')
            .update({ credits })
            .select()
            .match({ user_id: user_id })

        if (updateError) {
            throw updateError;
        }
        return { data, error: null };

    } catch (error) {
        console.error('Error updating subscription:', error);
        return { error };
    }
}

async function getSubscription(user_id) {
    try {
        const { data, error } = await supabase
            .from('UserSubscriptions')
            .select()
            .match({ user_id: user_id })
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

async function deleteSubscription(subscription_id) {
    const { data, error } = await supabase
        .from('UserSubscriptions')
        .delete()
        .match({ subscription_id: subscription_id });

    return { data, error };
}

module.exports = {
    createSubscription,
    updateSubscription,
    getSubscription,
    deleteSubscription,
    updateCredits
}