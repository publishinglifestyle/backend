const OpenAI = require('openai');
const openai = new OpenAI({ apiKey: process.env.OPEN_AI_KEY });

async function generateNurikabe(grid_size) {
    const context = [
        {
            role: 'system',
            content: `Act as a Nurikabe puzzle generator. Your task is to generate a valid Nurikabe puzzle based on the specified grid size. Follow these rules:
            - The puzzle grid must be a 2D array of size ${grid_size}x${grid_size}.
            - Numbers in the puzzle indicate the size of contiguous white cell 'islands.' Use null for black cells.
            - The solution grid must also be a 2D array of the same size. Use '■' for black cells and '□' for white cells. Numbers from the puzzle should be retained in the solution grid where the white cells are located.
            - Black cells should form a single continuous wall and should not create any 2x2 blocks of black cells.
            - White cell 'islands' must match the number specified in their respective cells and must not be adjacent horizontally or vertically.
            - Ensure that every white cell region is connected.
            - Return the output in the following JSON format:
            {
                'grid_size': ${grid_size},
                'puzzle': [[number|null, ...], [...], ...],
                'solution': [['■'|'□', ...], [...], ...]
            }
            Example for a 5x5 grid:
            {
                'grid_size': 5,
                'puzzle': [
                    [null, null, 1, null, null],
                    [3, null, null, 1, null],
                    [null, null, 2, null, null],
                    [null, 1, null, null, 1],
                    [null, null, null, 2, null]
                ],
                'solution': [
                    ['■', '■', '□', '■', '■'],
                    ['□', '■', '■', '□', '■'],
                    ['■', '■', '□', '■', '■'],
                    ['■', '□', '■', '■', '□'],
                    ['■', '■', '■', '□', '■']
                ]
            }
            Ensure the puzzle and solution are solvable and adhere to all Nurikabe rules.`,
        },
        {
            role: 'user',
            content: `Grid size: "${grid_size}".`
        }
    ];
    const response = await openai.chat.completions.create({
        messages: context,
        model: 'gpt-4o',
        response_format: { "type": "json_object" }
    });

    console.log(response.choices[0].message.content);

    return JSON.parse(response.choices[0].message.content);
}
module.exports = { generateNurikabe };
