require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_API_KEY);

async function createConversation(name, context, user_id) {
    const { data, error } = await supabase
        .from('Conversations')
        .insert([
            { name, context, user_id },
        ])
        .select()
        .single()

    return { data, error }
}

async function updateConversation(conversation_id, name, context, user_id) {
    try {
        const { data, error: updateError } = await supabase
            .from('Conversations')
            .update({ name, context, user_id })
            .select()
            .match({ id: conversation_id })

        if (updateError) {
            throw updateError;
        }
        return { data, error: null };

    } catch (error) {
        console.error('Error updating conversation:', error);
        return { error };
    }
}

async function getConversationsByUserId(user_id) {
    try {
        const { data, error } = await supabase
            .from('Conversations')
            .select()
            .match({ user_id: user_id })
            .order('created_at', { ascending: false })

        if (error) {
            throw error;
        }

        return { data, error }
    } catch (error) {
        console.error('Failed to retrieve conversations:', error);
        return { data: [], error }
    }
}

async function getConversation(conversation_id) {
    try {
        const { data, error } = await supabase
            .from('Conversations')
            .select()
            .match({ id: conversation_id })
            .single();

        if (error) {
            throw error;
        }

        return { data, error }
    } catch (error) {
        console.error('Failed to retrieve conversation:', error);
        return { error }
    }
}

async function deleteConversation(conversation_id) {
    const { data, error } = await supabase
        .from('Conversations')
        .delete()
        .match({ id: conversation_id });

    return { data, error };
}

async function updateSystemContext(conversation_id, newContext) {
    try {
        const { data, error: updateError } = await supabase
            .from('Conversations')
            .update({ context: newContext })
            .select()
            .match({ id: conversation_id });
        if (updateError) {
            throw updateError;
        }
        return { data, error: null };
    } catch (error) {
        console.error('Error updating system context:', error);
        return { error };
    }
}

module.exports = {
    createConversation,
    getConversationsByUserId,
    deleteConversation,
    getConversation,
    updateConversation,
    updateSystemContext
}