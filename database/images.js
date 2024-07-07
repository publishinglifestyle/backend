const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_API_KEY);
const { decode } = require('base64-arraybuffer')

async function upload(bucket, file_buffer, name) {
    // Check if the logo already exists
    const { data: existingData, error: existingError } = await supabase
        .storage
        .from(bucket)
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
            .from(bucket)
            .remove([name + '.png']);

        if (removeError) {
            return { data: null, error: removeError };
        }
    }

    // Upload the new logo
    const { data, error } = await supabase
        .storage
        .from(bucket)
        .upload(name + '.png', decode(file_buffer), {
            contentType: 'image/png'
        });

    return { data, error };
}

async function download(bucket, name) {
    const { data, error } = await supabase
        .storage
        .from(bucket)
        .download(name + '.png')

    return { data, error };
}

module.exports = {
    upload,
    download,
};