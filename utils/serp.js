require('dotenv').config()
const { getJson } = require("serpapi");
const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPEN_AI_KEY });

const generateGoogleQuery = async (website_content) => {
    const system_prompt = "You are an AI designed to construct Google search queries. Your outputs should be concise, accurate, and formatted as a single search string. Your response must only include the string without double quotes."
    const user_prompt = "Website: " + website_content

    let completion = await openai.chat.completions.create({
        messages: [
            { "role": "system", "content": system_prompt },
            { "role": "user", "content": user_prompt }
        ],
        model: 'gpt-4o'
    });

    return completion.choices[0].message.content
}

const webSearch = async (query) => {
    let allResults = [];
    const firstPageParams = {
        api_key: process.env.SERP_AI_KEY,
        engine: "google",
        q: await generateGoogleQuery(query),
        google_domain: "google.com",
        num: 10
    };

    try {
        // Fetch the first page of results
        const json = await getJson(firstPageParams);
        console.log("Fetched a page:", json);

        // Collect results from the first page
        allResults = allResults.concat(json.organic_results);
    } catch (error) {
        console.error("An error occurred during the search:", error);
    }

    console.log(allResults);

    return allResults;
}

module.exports = {
    webSearch
};