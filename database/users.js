const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_API_KEY);
const { decode } = require('base64-arraybuffer')

async function createUser(email, password, first_name, last_name) {
    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    try {
        const { data, error } = await supabase
            .from('Users')
            .insert([
                { first_name: first_name, last_name: last_name, email: email, password: hashedPassword, role: 'user' },
            ])
            .select()

        if (error) {
            throw error;
        }

        return { data, error }
    } catch (error) {
        console.error('Error creating user:', error);

        // Handle known error types (e.g., unique constraint violation)
        if (error.code === '23505') { // Unique violation
            return { error: { message: 'A user with this email already exists.' } };
        }

        // General error
        return { error: { message: 'Failed to create user.' } };
    }
}

async function login(email, password) {
    const { data, error } = await supabase
        .from('Users')
        .select("id, email, password")
        .eq('email', email)
        .single();

    // Handle errors from the Supabase query
    if (error) {
        console.error('Error fetching user:', error);
        return { error };
    }

    // Handle case where no user is found
    if (!data) {
        return { code: 404, response: 'User not found.' };
    }

    // Compare provided password with hashed password
    const isMatch = await bcrypt.compare(password, data.password);
    if (!isMatch) {
        return { code: 401, response: 'Invalid credentials.' };
    }

    // Generate JWT
    const token = jwt.sign({ id: data.id }, process.env.SECRET, { expiresIn: '24h' });

    return { token };
}

async function getUserById(user_id) {
    try {
        // Fetch user data
        const { data: userData, error: userError } = await supabase
            .from('Users')
            .select("id, first_name, last_name, email, role, price_id")
            .eq('id', user_id)
            .single();

        // Handle errors from the Supabase query for Users
        if (userError) {
            console.error('Error fetching user:', userError.message);
            return { error: userError.message };
        }

        // Handle case where no user is found
        if (!userData) {
            return { code: 404, response: 'User not found.' };
        }

        // Fetch subscription data based on user's price_id
        const { data: subscriptionData, error: subscriptionError } = await supabase
            .from('Subscriptions')
            .select('level')
            .eq('price_id', userData.price_id)
            .single();

        // Handle errors from the Supabase query for Subscriptions
        if (subscriptionError) {
            console.error('Error fetching subscription:', subscriptionError.message);
            return { error: subscriptionError.message };
        }

        // Include subscription level in user data if subscriptionData exists
        const userWithSubscription = {
            ...userData,
            subscription_level: subscriptionData ? subscriptionData.level : null
        };

        return { data: userWithSubscription, error: null };
    } catch (error) {
        console.error('Error in getUserById:', error.message);
        return { error: error.message };
    }
}

async function getUserByEmail(email) {
    const { data, error } = await supabase
        .from('Users')
        .select("id, email, role")
        .eq('email', email)
        .single();

    // Handle errors from the Supabase query
    if (error) {
        console.error('Error fetching user:', error);
        return { error };
    }

    // Handle case where no user is found
    if (!data) {
        return { code: 404, response: 'User not found.' };
    }

    return { data, error };
}

async function updateUser(user_id, first_name, last_name, email) {
    const { data, error } = await supabase
        .from('Users')
        .update({ first_name, last_name, email })
        .select()
        .match({ id: user_id });

    return { data, error };
}

async function uploadProfilePic(file_buffer, name) {
    // Check if the logo already exists
    const { data: existingData, error: existingError } = await supabase
        .storage
        .from('users')
        .list('', {
            search: name + '.png'
        });

    if (existingError) {
        return { data: null, error: existingError };
    }

    // If the logo exists, remove it
    if (existingData.length > 0) {
        const { error: removeError } = await supabase
            .storage
            .from('users')
            .remove([name + '.png']);

        if (removeError) {
            return { data: null, error: removeError };
        }
    }

    // Upload the new logo
    const { data, error } = await supabase
        .storage
        .from('users')
        .upload(name + '.png', decode(file_buffer), {
            contentType: 'image/png'
        });

    return { data, error };
}

async function downloadProfilePic(name) {
    const { data, error } = await supabase
        .storage
        .from('users')
        .download(name + '.png')

    return { data, error };
}

async function resetPassword(user_id, newPassword) {
    try {
        // Hash the new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        const { data, error } = await supabase
            .from('Users')
            .update({ password: hashedPassword })
            .match({ id: user_id })
            .select()
            .single();

        return { data, error };

    } catch (error) {
        console.error('Failed to reset password:', error);
        return { error };
    }
}

module.exports = {
    createUser,
    login,
    getUserById,
    getUserByEmail,
    updateUser,
    uploadProfilePic,
    downloadProfilePic,
    resetPassword
};