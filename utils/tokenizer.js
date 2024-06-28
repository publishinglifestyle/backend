const encoding_for_model = require("tiktoken").encoding_for_model;

function calculate_tokens(text) {
    const enc = encoding_for_model("gpt-4o");
    const tokens = enc.encode(text);
    enc.free();
    return tokens.length;
}

module.exports = { calculate_tokens }