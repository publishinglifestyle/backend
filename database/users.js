const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_API_KEY);

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
    console.log("user_id", user_id)
    try {
        // Fetch user data
        const { data: userData, error: userError } = await supabase
            .from('Users')
            .select("id, first_name, last_name, email, role, price_id, mj_auth_token")
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

async function initiatePasswordReset(email) {
    // Generate a reset token
    const reset_token = crypto.randomBytes(20).toString('hex');
    const reset_token_expiry = new Date(Date.now() + 3600000); // Token expires in 1 hour

    const { data, error } = await supabase
        .from('Users')
        .update({ reset_token, reset_token_expiry })
        .select()
        .match({ email: email });

    return reset_token
}

const resetUserPassword = async (token, newPassword) => {
    try {
        // Verify the reset token and its expiry
        const { data, error } = await supabase
            .from('Users')
            .select()
            .eq('reset_token', token)
            .gt('reset_token_expiry', new Date().toISOString())
            .single();

        if (error) {
            console.error('Error fetching user:', error);
            return { error };
        }

        // Hash the new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update the user's password and clear the reset token fields
        const { data: update_user_password, error: update_user_password_error } = await supabase
            .from('Users')
            .update({ password: hashedPassword, reset_token: null, reset_token_expiry: null })
            .eq('id', data.id)
            .single();

        if (update_user_password_error) {
            console.error('Error updating user password:', update_user_password_error);
            return { error: update_user_password_error };
        }

        return { data: update_user_password, error: null };
    } catch (error) {
        console.error('Error:', error.message);
        return { error: error.message };
    }
}

async function findUsersWithoutSubscription() {
    try {
        // First, fetch all users from the Users table
        const { data: allUsers, error: usersError } = await supabase
            .from('Users')
            .select('id, first_name, last_name, email');

        if (usersError) {
            throw usersError;
        }

        // Then, fetch all user_ids from the UserSubscriptions table
        const { data: subscribedUsers, error: subscriptionsError } = await supabase
            .from('UserSubscriptions')
            .select('user_id');

        if (subscriptionsError) {
            throw subscriptionsError;
        }

        // Get a set of subscribed user IDs
        const subscribedUserIds = new Set(subscribedUsers.map(sub => sub.user_id));

        // Filter out users who are not in the subscribedUserIds set
        const usersWithoutSubscription = allUsers.filter(user => !subscribedUserIds.has(user.id));

        return { data: usersWithoutSubscription, error: null };
    } catch (error) {
        console.error('Error finding users without subscription:', error.message);
        return { error: error.message };
    }
}

async function updateUserMjAuthToken(user_id, mj_auth_token) {
    const { data, error } = await supabase
        .from('Users')
        .update({ mj_auth_token })
        .select()
        .match({ id: user_id });

    return { data, error };
}

module.exports = {
    createUser,
    login,
    getUserById,
    getUserByEmail,
    updateUser,
    resetPassword,
    initiatePasswordReset,
    resetUserPassword,
    findUsersWithoutSubscription,
    updateUserMjAuthToken
};