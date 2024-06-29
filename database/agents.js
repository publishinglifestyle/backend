require('dotenv').config();

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_API_KEY);

async function createAgent(name, temperature, type, level, prompt) {
    const context = []
    const { data, error } = await supabase
        .from('Agents')
        .insert([
            { name, temperature, type, level, prompt },
        ])
        .select()

    return { data, error }
}

async function updateAgent(agent_id, name, temperature, type, level, prompt) {
    try {
        const { data, error: updateError } = await supabase
            .from('Agents')
            .update({ name, temperature, type, level, prompt })
            .select()
            .match({ id: agent_id })

        if (updateError) {
            throw updateError;
        }
        return { data, error: null };

    } catch (error) {
        console.error('Error updating agent:', error);
        return { error };
    }
}

async function getAgentsPerLevel(level) {
    try {
        const { data, error } = await supabase
            .from('Agents')
            .select()
            .match({ level: level })

        if (error) {
            throw error;
        }

        return { data, error }
    } catch (error) {
        console.error('Failed to retrieve agents:', error);
        return { error }
    }
}

async function getAllAgents() {
    try {
        const { data, error } = await supabase
            .from('Agents')
            .select()

        if (error) {
            throw error;
        }

        return { data, error }
    } catch (error) {
        console.error('Failed to retrieve agents:', error);
        return { error }
    }
}

async function deleteAgent(agent_id) {
    const { data, error } = await supabase
        .from('Agents')
        .delete()
        .match({ id: agent_id });

    return { data, error };
}

async function getAgentById(agent_id) {
    try {
        const { data, error } = await supabase
            .from('Agents')
            .select()
            .match({ id: agent_id })
            .single();

        if (error) {
            throw error;
        }

        return { data, error }
    } catch (error) {
        console.error('Failed to retrieve agent:', error);
        return { error }
    }
}

module.exports = {
    createAgent,
    updateAgent,
    getAgentsPerLevel,
    getAllAgents,
    deleteAgent,
    getAgentById
}