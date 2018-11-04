const fetch = require('node-superfetch');

module.exports.run = async (bot, message, args) => {
    await message.delete();

    fetch.get("https://nekos.life/api/neko").then(res =>
        message.channel.send({
            "embed": {
                "title": "Nekos!",
                "color": 0255255,
                "footer": {
                    "icon_url": "https://image.freepik.com/free-icon/question-mark_318-52837.jpg",
                    "text": "Powered by nekos.life API"
                },
                "image": {
                    "url": res.body.neko
                }
            }
        })
    )
}

module.exports.help = {
    name: "neko"
}