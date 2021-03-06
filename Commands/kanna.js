const fetch = require('node-superfetch');
const errors = require('../utils/errors.js');

module.exports.run = async (bot, message, args) => {
    let text = args.join(" ");
    if (!text) {
        errors.noApiText(message);
    } else {
        fetch.get(`https://nekobot.xyz/api/imagegen?type=kannagen&text=${text}`).then(res =>
            message.channel.send({
                "embed": {
                    "color": 545762,
                    "image": {
                        "url": res.body.message
                    },
                    "footer": {
                        "text": `Done by ${message.author.username}`
                    }
                }
            }));
    }
}

module.exports.help = {
    name: "kanna",
    role: "fun",
    description: "Puts text on Kanna's paper"
}