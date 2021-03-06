module.exports.run = async (bot, message, args) => {
    if (!message.member.hasPermission("MANAGE_SERVER")) return errors.noPerms(message, "MANAGE_SERVER");

    bot.emit('guildMemberRemove', message.member || await message.guild.fetchMember(message.author));
}

module.exports.help = {
    name: "left",
    role: "hidden",
    description: "Sends a dummy joined message"
}