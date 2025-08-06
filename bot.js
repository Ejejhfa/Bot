const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, PermissionFlagsBits, ChannelType, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Bot configuratie
const config = {
    token: 'MTQwMTU0MDE3Mjc5Mjk4Nzc1OQ.G_1_ZT.tEFBWYAqmyHi60v3ZVbLObSBvigFd8rZ1VjIJg', // Vervang met je bot token
    guildId: '1383067494402494466', // Vervang met je server ID
    
    // Kanaal IDs
    ticketCategoryId: '1383903116604342423', // Categorie voor ticket kanalen
    logChannelId: '1401544603802406924', // Log kanaal voor ticket acties
    transcriptChannelId: '1401544577818820659', // Kanaal voor ticket transcripts
    
    // Rol IDs
    supportRoleId: '1383902439064731808', // Support team rol
    adminRoleId: '1383902152845426698', // Admin rol
    
    // Ticket instellingen
    maxTicketsPerUser: 3,
    ticketAutoClose: 24 * 60 * 60 * 1000, // 24 uur in milliseconden
    transcriptEnabled: true
};

// Initialize de client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// Data opslag
let tickets = new Map();
let ticketCounter = 1;
let userTickets = new Map();

// Ticket categorieën
const ticketCategories = {
    'support': {
        name: '🎫 Algemene Support',
        description: 'Voor algemene vragen en ondersteuning',
        emoji: '🎫'
    },
    'bug': {
        name: '🐛 Bug Report',
        description: 'Rapporteer een bug of probleem',
        emoji: '🐛'
    },
    'suggestion': {
        name: '💡 Suggestie',
        description: 'Deel een suggestie of idee',
        emoji: '💡'
    },
    'complaint': {
        name: '📝 Klacht',
        description: 'Dien een klacht in',
        emoji: '📝'
    },
    'partnership': {
        name: '🤝 Partnership',
        description: 'Partnership aanvragen',
        emoji: '🤝'
    },
    'other': {
        name: '❓ Overig',
        description: 'Voor alle andere zaken',
        emoji: '❓'
    }
};

// Laad data van bestanden
function loadData() {
    const files = ['tickets.json', 'userTickets.json', 'ticketCounter.json'];
    const maps = [tickets, userTickets];
    
    files.forEach((file, index) => {
        const filePath = path.join(__dirname, 'data', file);
        if (fs.existsSync(filePath)) {
            try {
                const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                if (file === 'ticketCounter.json') {
                    ticketCounter = data.counter || 1;
                } else {
                    maps[index] = new Map(data);
                }
            } catch (error) {
                console.error(`Error loading ${file}:`, error);
            }
        }
    });
}

// Sla data op
function saveData() {
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
    
    const files = [
        { name: 'tickets.json', data: tickets },
        { name: 'userTickets.json', data: userTickets },
        { name: 'ticketCounter.json', data: { counter: ticketCounter } }
    ];
    
    files.forEach(file => {
        try {
            if (file.name === 'ticketCounter.json') {
                fs.writeFileSync(
                    path.join(dataDir, file.name), 
                    JSON.stringify(file.data, null, 2)
                );
            } else {
                fs.writeFileSync(
                    path.join(dataDir, file.name), 
                    JSON.stringify([...file.data])
                );
            }
        } catch (error) {
            console.error(`Error saving ${file.name}:`, error);
        }
    });
}

// Bot klaar event
client.once('ready', async () => {
    console.log(`🎫 ${client.user.tag} Ticket Bot is online!`);
    console.log(`🇳🇱 Nederlandse Ticket Bot gestart`);
    
    loadData();
    
    // Registreer slash commands
    await registerCommands();
    
    // Start interval functies
    setInterval(saveData, 300000); // Elke 5 minuten
    setInterval(checkInactiveTickets, 600000); // Elke 10 minuten
    
    // Set bot status
    client.user.setActivity('🎫 Ticket Systeem', { type: 'WATCHING' });
});

// Registreer alle commands
async function registerCommands() {
    const commands = [
        // Ticket commands
        new SlashCommandBuilder()
            .setName('ticket')
            .setDescription('Maak een nieuw ticket aan')
            .addStringOption(option =>
                option.setName('categorie')
                    .setDescription('Kies een ticket categorie')
                    .setRequired(true)
                    .addChoices(
                        { name: '🎫 Algemene Support', value: 'support' },
                        { name: '🐛 Bug Report', value: 'bug' },
                        { name: '💡 Suggestie', value: 'suggestion' },
                        { name: '📝 Klacht', value: 'complaint' },
                        { name: '🤝 Partnership', value: 'partnership' },
                        { name: '❓ Overig', value: 'other' }
                    )
            )
            .addStringOption(option =>
                option.setName('onderwerp')
                    .setDescription('Kort onderwerp van je ticket')
                    .setRequired(true)
                    .setMaxLength(100)
            ),

        new SlashCommandBuilder()
            .setName('close')
            .setDescription('Sluit het huidige ticket')
            .addStringOption(option =>
                option.setName('reden')
                    .setDescription('Reden voor het sluiten van het ticket')
                    .setRequired(false)
            ),

        new SlashCommandBuilder()
            .setName('add')
            .setDescription('Voeg een gebruiker toe aan het ticket')
            .addUserOption(option =>
                option.setName('gebruiker')
                    .setDescription('De gebruiker om toe te voegen')
                    .setRequired(true)
            ),

        new SlashCommandBuilder()
            .setName('remove')
            .setDescription('Verwijder een gebruiker uit het ticket')
            .addUserOption(option =>
                option.setName('gebruiker')
                    .setDescription('De gebruiker om te verwijderen')
                    .setRequired(true)
            ),

        new SlashCommandBuilder()
            .setName('rename')
            .setDescription('Hernoem het ticket')
            .addStringOption(option =>
                option.setName('naam')
                    .setDescription('Nieuwe naam voor het ticket')
                    .setRequired(true)
                    .setMaxLength(100)
            ),

        // Panel commands
        new SlashCommandBuilder()
            .setName('panel')
            .setDescription('Stuur het ticket panel')
            .addChannelOption(option =>
                option.setName('kanaal')
                    .setDescription('Het kanaal om het panel naar te sturen')
                    .setRequired(false)
                    .addChannelTypes(ChannelType.GuildText)
            )
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

        // Stats commands
        new SlashCommandBuilder()
            .setName('ticketstats')
            .setDescription('Bekijk ticket statistieken')
            .addUserOption(option =>
                option.setName('gebruiker')
                    .setDescription('Bekijk statistieken van een specifieke gebruiker')
                    .setRequired(false)
            )
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

        // Transcript command
        new SlashCommandBuilder()
            .setName('transcript')
            .setDescription('Genereer een transcript van het huidige ticket')
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

        // Force close command
        new SlashCommandBuilder()
            .setName('forceclose')
            .setDescription('Forceer het sluiten van een ticket')
            .addStringOption(option =>
                option.setName('reden')
                    .setDescription('Reden voor het forceren van het sluiten')
                    .setRequired(false)
            )
            .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

        // Help command
        new SlashCommandBuilder()
            .setName('help')
            .setDescription('Bekijk alle beschikbare ticket commands')
    ];

    try {
        const guild = client.guilds.cache.get(config.guildId);
        if (guild) {
            await guild.commands.set(commands);
            console.log('✅ Slash commands geregistreerd');
        }
    } catch (error) {
        console.error('Error registering commands:', error);
    }
}

// Handle slash commands
client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;

        try {
            switch (commandName) {
                case 'ticket':
                    await handleTicketCommand(interaction);
                    break;
                case 'close':
                    await handleCloseCommand(interaction);
                    break;
                case 'add':
                    await handleAddCommand(interaction);
                    break;
                case 'remove':
                    await handleRemoveCommand(interaction);
                    break;
                case 'rename':
                    await handleRenameCommand(interaction);
                    break;
                case 'panel':
                    await handlePanelCommand(interaction);
                    break;
                case 'ticketstats':
                    await handleStatsCommand(interaction);
                    break;
                case 'transcript':
                    await handleTranscriptCommand(interaction);
                    break;
                case 'forceclose':
                    await handleForceCloseCommand(interaction);
                    break;
                case 'help':
                    await handleHelpCommand(interaction);
                    break;
            }
        } catch (error) {
            console.error(`Error handling command ${commandName}:`, error);
            const errorEmbed = new EmbedBuilder()
                .setTitle('❌ Fout')
                .setDescription('Er is een fout opgetreden bij het uitvoeren van dit command.')
                .setColor('#ff0000');
            
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    }

    // Handle button interactions
    if (interaction.isButton()) {
        if (interaction.customId.startsWith('ticket_')) {
            await handleTicketButton(interaction);
        } else if (interaction.customId.startsWith('close_')) {
            await handleCloseButton(interaction);
        }
    }

    // Handle select menu interactions
    if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'ticket_category') {
            await handleCategorySelect(interaction);
        }
    }

    // Handle modal interactions
    if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith('ticket_modal_')) {
            await handleTicketModal(interaction);
        }
    }
});

// Ticket command handler
async function handleTicketCommand(interaction) {
    const category = interaction.options.getString('categorie');
    const subject = interaction.options.getString('onderwerp');
    
    await createTicket(interaction, category, subject);
}

// Create ticket function
async function createTicket(interaction, category, subject, description = null) {
    const userId = interaction.user.id;
    
    // Check if user has too many open tickets
    const userTicketCount = userTickets.get(userId) || [];
    const openTickets = userTicketCount.filter(ticketId => {
        const ticket = tickets.get(ticketId);
        return ticket && ticket.status === 'open';
    });
    
    if (openTickets.length >= config.maxTicketsPerUser) {
        return await interaction.reply({
            content: `❌ Je hebt al ${config.maxTicketsPerUser} open tickets. Sluit eerst een ticket voordat je een nieuw ticket aanmaakt.`,
            ephemeral: true
        });
    }
    
    const guild = interaction.guild;
    const category_channel = guild.channels.cache.get(config.ticketCategoryId);
    
    if (!category_channel) {
        return await interaction.reply({
            content: '❌ Ticket categorie niet gevonden. Neem contact op met een administrator.',
            ephemeral: true
        });
    }
    
    const ticketId = `ticket-${ticketCounter.toString().padStart(4, '0')}`;
    ticketCounter++;
    
    try {
        // Maak ticket kanaal
        const ticketChannel = await guild.channels.create({
            name: `${ticketId}-${category}`,
            type: ChannelType.GuildText,
            parent: category_channel.id,
            permissionOverwrites: [
                {
                    id: guild.roles.everyone.id,
                    deny: [PermissionFlagsBits.ViewChannel]
                },
                {
                    id: userId,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory,
                        PermissionFlagsBits.AttachFiles
                    ]
                },
                {
                    id: config.supportRoleId,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory,
                        PermissionFlagsBits.AttachFiles,
                        PermissionFlagsBits.ManageMessages
                    ]
                },
                {
                    id: config.adminRoleId,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory,
                        PermissionFlagsBits.AttachFiles,
                        PermissionFlagsBits.ManageMessages,
                        PermissionFlagsBits.ManageChannels
                    ]
                }
            ]
        });
        
        // Ticket data opslaan
        const ticketData = {
            id: ticketId,
            channelId: ticketChannel.id,
            userId: userId,
            category: category,
            subject: subject,
            description: description,
            status: 'open',
            createdAt: Date.now(),
            lastActivity: Date.now(),
            messages: []
        };
        
        tickets.set(ticketId, ticketData);
        
        // Update user tickets
        const userTicketList = userTickets.get(userId) || [];
        userTicketList.push(ticketId);
        userTickets.set(userId, userTicketList);
        
        // Welkom bericht in ticket
        const welcomeEmbed = new EmbedBuilder()
            .setTitle(`🎫 Ticket ${ticketId}`)
            .setDescription(`**Categorie:** ${ticketCategories[category].name}\n**Onderwerp:** ${subject}${description ? `\n**Beschrijving:** ${description}` : ''}`)
            .setColor('#0099ff')
            .addFields(
                { name: '👤 Ticket eigenaar', value: `<@${userId}>`, inline: true },
                { name: '📅 Aangemaakt', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                { name: '📊 Status', value: '🟢 Open', inline: true }
            )
            .setFooter({ text: 'Een support medewerker zal je zo snel mogelijk helpen!' })
            .setTimestamp();
        
        const actionRow = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`close_${ticketId}`)
                    .setLabel('Sluit Ticket')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('🔒'),
                new ButtonBuilder()
                    .setCustomId(`transcript_${ticketId}`)
                    .setLabel('Transcript')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('📄')
            );
        
        await ticketChannel.send({
            content: `<@${userId}> <@&${config.supportRoleId}>`,
            embeds: [welcomeEmbed],
            components: [actionRow]
        });
        
        // Bevestiging naar gebruiker
        await interaction.reply({
            content: `✅ Je ticket is aangemaakt! ${ticketChannel}`,
            ephemeral: true
        });
        
        // Log actie
        await logTicketAction('create', interaction.user, ticketData);
        
    } catch (error) {
        console.error('Error creating ticket:', error);
        await interaction.reply({
            content: '❌ Er is een fout opgetreden bij het aanmaken van je ticket.',
            ephemeral: true
        });
    }
}

// Close command handler
async function handleCloseCommand(interaction) {
    const ticketData = getTicketByChannel(interaction.channel.id);
    
    if (!ticketData) {
        return await interaction.reply({
            content: '❌ Dit is geen ticket kanaal.',
            ephemeral: true
        });
    }
    
    if (ticketData.status === 'closed') {
        return await interaction.reply({
            content: '❌ Dit ticket is al gesloten.',
            ephemeral: true
        });
    }
    
    // Check permissions
    if (ticketData.userId !== interaction.user.id && 
        !interaction.member.roles.cache.has(config.supportRoleId) && 
        !interaction.member.roles.cache.has(config.adminRoleId)) {
        return await interaction.reply({
            content: '❌ Je hebt geen toestemming om dit ticket te sluiten.',
            ephemeral: true
        });
    }
    
    const reason = interaction.options.getString('reden') || 'Geen reden opgegeven';
    await closeTicket(ticketData, interaction.user, reason);
    
    await interaction.reply({
        content: '✅ Ticket wordt gesloten...',
        ephemeral: true
    });
}

// Add user command handler
async function handleAddCommand(interaction) {
    const ticketData = getTicketByChannel(interaction.channel.id);
    const targetUser = interaction.options.getUser('gebruiker');
    
    if (!ticketData) {
        return await interaction.reply({
            content: '❌ Dit is geen ticket kanaal.',
            ephemeral: true
        });
    }
    
    if (!interaction.member.roles.cache.has(config.supportRoleId) && 
        !interaction.member.roles.cache.has(config.adminRoleId)) {
        return await interaction.reply({
            content: '❌ Je hebt geen toestemming om gebruikers toe te voegen.',
            ephemeral: true
        });
    }
    
    try {
        await interaction.channel.permissionOverwrites.create(targetUser.id, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
            AttachFiles: true
        });
        
        const embed = new EmbedBuilder()
            .setTitle('✅ Gebruiker Toegevoegd')
            .setDescription(`${targetUser} is toegevoegd aan dit ticket door ${interaction.user}`)
            .setColor('#00ff00')
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
        await logTicketAction('add_user', interaction.user, ticketData, `Gebruiker ${targetUser.tag} toegevoegd`);
        
    } catch (error) {
        console.error('Error adding user to ticket:', error);
        await interaction.reply({
            content: '❌ Fout bij het toevoegen van de gebruiker.',
            ephemeral: true
        });
    }
}

// Remove user command handler
async function handleRemoveCommand(interaction) {
    const ticketData = getTicketByChannel(interaction.channel.id);
    const targetUser = interaction.options.getUser('gebruiker');
    
    if (!ticketData) {
        return await interaction.reply({
            content: '❌ Dit is geen ticket kanaal.',
            ephemeral: true
        });
    }
    
    if (!interaction.member.roles.cache.has(config.supportRoleId) && 
        !interaction.member.roles.cache.has(config.adminRoleId)) {
        return await interaction.reply({
            content: '❌ Je hebt geen toestemming om gebruikers te verwijderen.',
            ephemeral: true
        });
    }
    
    if (targetUser.id === ticketData.userId) {
        return await interaction.reply({
            content: '❌ Je kunt de ticket eigenaar niet verwijderen.',
            ephemeral: true
        });
    }
    
    try {
        await interaction.channel.permissionOverwrites.delete(targetUser.id);
        
        const embed = new EmbedBuilder()
            .setTitle('✅ Gebruiker Verwijderd')
            .setDescription(`${targetUser} is verwijderd uit dit ticket door ${interaction.user}`)
            .setColor('#ff9500')
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
        await logTicketAction('remove_user', interaction.user, ticketData, `Gebruiker ${targetUser.tag} verwijderd`);
        
    } catch (error) {
        console.error('Error removing user from ticket:', error);
        await interaction.reply({
            content: '❌ Fout bij het verwijderen van de gebruiker.',
            ephemeral: true
        });
    }
}

// Rename command handler
async function handleRenameCommand(interaction) {
    const ticketData = getTicketByChannel(interaction.channel.id);
    const newName = interaction.options.getString('naam');
    
    if (!ticketData) {
        return await interaction.reply({
            content: '❌ Dit is geen ticket kanaal.',
            ephemeral: true
        });
    }
    
    if (!interaction.member.roles.cache.has(config.supportRoleId) && 
        !interaction.member.roles.cache.has(config.adminRoleId)) {
        return await interaction.reply({
            content: '❌ Je hebt geen toestemming om dit ticket te hernoemen.',
            ephemeral: true
        });
    }
    
    try {
        const sanitizedName = newName.toLowerCase().replace(/[^a-z0-9\-]/g, '-').substring(0, 50);
        const fullName = `${ticketData.id}-${sanitizedName}`;
        
        await interaction.channel.setName(fullName);
        
        ticketData.subject = newName;
        tickets.set(ticketData.id, ticketData);
        
        const embed = new EmbedBuilder()
            .setTitle('✅ Ticket Hernoemd')
            .setDescription(`Ticket hernoemd naar: **${newName}**\nDoor: ${interaction.user}`)
            .setColor('#00ff00')
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
        await logTicketAction('rename', interaction.user, ticketData, `Hernoemd naar: ${newName}`);
        
    } catch (error) {
        console.error('Error renaming ticket:', error);
        await interaction.reply({
            content: '❌ Fout bij het hernoemen van het ticket.',
            ephemeral: true
        });
    }
}

// Panel command handler
async function handlePanelCommand(interaction) {
    const targetChannel = interaction.options.getChannel('kanaal') || interaction.channel;
    
    const embed = new EmbedBuilder()
        .setTitle('🎫 Ticket Systeem')
        .setDescription('Klik op de knop hieronder om een nieuw ticket aan te maken.\n\n**Ticket Categorieën:**\n🎫 Algemene Support\n🐛 Bug Report\n💡 Suggestie\n📝 Klacht\n🤝 Partnership\n❓ Overig')
        .setColor('#0099ff')
        .setFooter({ text: 'Klik op "Maak Ticket" om te beginnen' })
        .setTimestamp();
    
    const actionRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('ticket_create')
                .setLabel('Maak Ticket')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🎫')
        );
    
    await targetChannel.send({
        embeds: [embed],
        components: [actionRow]
    });
    
    await interaction.reply({
        content: `✅ Ticket panel verzonden naar ${targetChannel}`,
        ephemeral: true
    });
}

// Stats command handler
async function handleStatsCommand(interaction) {
    const targetUser = interaction.options.getUser('gebruiker');
    
    if (targetUser) {
        // User specific stats
        const userTicketList = userTickets.get(targetUser.id) || [];
        const userTicketData = userTicketList.map(id => tickets.get(id)).filter(Boolean);
        
        const openTickets = userTicketData.filter(t => t.status === 'open').length;
        const closedTickets = userTicketData.filter(t => t.status === 'closed').length;
        const totalTickets = userTicketData.length;
        
        const embed = new EmbedBuilder()
            .setTitle(`📊 Ticket Statistieken - ${targetUser.username}`)
            .setThumbnail(targetUser.displayAvatarURL())
            .setColor('#0099ff')
            .addFields(
                { name: '🎫 Totaal Tickets', value: totalTickets.toString(), inline: true },
                { name: '🟢 Open Tickets', value: openTickets.toString(), inline: true },
                { name: '🔒 Gesloten Tickets', value: closedTickets.toString(), inline: true }
            )
            .setTimestamp();
        
        await interaction.reply({ embeds: [embed] });
    } else {
        // General stats
        const allTickets = [...tickets.values()];
        const openTickets = allTickets.filter(t => t.status === 'open').length;
        const closedTickets = allTickets.filter(t => t.status === 'closed').length;
        const totalTickets = allTickets.length;
        
        // Category stats
        const categoryStats = {};
        Object.keys(ticketCategories).forEach(cat => {
            categoryStats[cat] = allTickets.filter(t => t.category === cat).length;
        });
        
        const embed = new EmbedBuilder()
            .setTitle('📊 Server Ticket Statistieken')
            .setColor('#0099ff')
            .addFields(
                { name: '🎫 Totaal Tickets', value: totalTickets.toString(), inline: true },
                { name: '🟢 Open Tickets', value: openTickets.toString(), inline: true },
                { name: '🔒 Gesloten Tickets', value: closedTickets.toString(), inline: true }
            )
            .setTimestamp();
        
        // Add category breakdown
        const categoryText = Object.entries(categoryStats)
            .map(([cat, count]) => `${ticketCategories[cat].emoji} ${ticketCategories[cat].name}: ${count}`)
            .join('\n');
        
        embed.addFields({ name: '📋 Per Categorie', value: categoryText || 'Geen data', inline: false });
        
        await interaction.reply({ embeds: [embed] });
    }
}

// Transcript command handler
async function handleTranscriptCommand(interaction) {
    const ticketData = getTicketByChannel(interaction.channel.id);
    
    if (!ticketData) {
        return await interaction.reply({
            content: '❌ Dit is geen ticket kanaal.',
            ephemeral: true
        });
    }
    
    await interaction.deferReply();
    
    try {
        const transcript = await generateTranscript(interaction.channel, ticketData);
        
        await interaction.editReply({
            content: '✅ Transcript gegenereerd!',
            files: [transcript]
        });
        
    } catch (error) {
        console.error('Error generating transcript:', error);
        await interaction.editReply({
            content: '❌ Fout bij het genereren van het transcript.'
        });
    }
}

// Force close command handler
async function handleForceCloseCommand(interaction) {
    const ticketData = getTicketByChannel(interaction.channel.id);
    
    if (!ticketData) {
        return await interaction.reply({
            content: '❌ Dit is geen ticket kanaal.',
            ephemeral: true
        });
    }
    
    const reason = interaction.options.getString('reden') || 'Geforceerd gesloten door admin';
    await closeTicket(ticketData, interaction.user, reason);
    
    await interaction.reply({
        content: '✅ Ticket wordt geforceerd gesloten...',
        ephemeral: true
    });
}

// Help command handler
async function handleHelpCommand(interaction) {
    const embed = new EmbedBuilder()
        .setTitle('🎫 Ticket Bot Commands')
        .setColor('#0099ff')
        .setDescription('**Alle beschikbare ticket commands:**')
        .addFields(
            { 
                name: '🎫 Gebruiker Commands', 
                value: '`/ticket` - Maak een nieuw ticket\n`/close` - Sluit je ticket\n`/help` - Deze help pagina', 
                inline: true 
            },
            { 
                name: '🛠️ Staff Commands', 
                value: '`/add` - Voeg gebruiker toe\n`/remove` - Verwijder gebruiker\n`/rename` - Hernoem ticket\n`/transcript` - Genereer transcript', 
                inline: true 
            },
            { 
                name: '👑 Admin Commands', 
                value: '`/panel` - Stuur ticket panel\n`/ticketstats` - Bekijk statistieken\n`/forceclose` - Forceer sluiten', 
                inline: true 
            }
        )
        .setFooter({ text: 'Nederlandse Ticket Bot' })
        .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
}

// Button interaction handlers
async function handleTicketButton(interaction) {
    if (interaction.customId === 'ticket_create') {
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('ticket_category')
            .setPlaceholder('Kies een ticket categorie...')
            .addOptions(
                Object.entries(ticketCategories).map(([key, category]) => ({
                    label: category.name,
                    description: category.description,
                    value: key,
                    emoji: category.emoji
                }))
            );
        
        const row = new ActionRowBuilder().addComponents(selectMenu);
        
        await interaction.reply({
            content: 'Selecteer een categorie voor je ticket:',
            components: [row],
            ephemeral: true
        });
    }
}

async function handleCloseButton(interaction) {
    const ticketId = interaction.customId.split('_')[1];
    const ticketData = tickets.get(ticketId);
    
    if (!ticketData) {
        return await interaction.reply({
            content: '❌ Ticket niet gevonden.',
            ephemeral: true
        });
    }
    
    if (ticketData.status === 'closed') {
        return await interaction.reply({
            content: '❌ Dit ticket is al gesloten.',
            ephemeral: true
        });
    }
    
    // Check permissions
    if (ticketData.userId !== interaction.user.id && 
        !interaction.member.roles.cache.has(config.supportRoleId) && 
        !interaction.member.roles.cache.has(config.adminRoleId)) {
        return await interaction.reply({
            content: '❌ Je hebt geen toestemming om dit ticket te sluiten.',
            ephemeral: true
        });
    }
    
    await closeTicket(ticketData, interaction.user, 'Gesloten via knop');
    
    await interaction.reply({
        content: '✅ Ticket wordt gesloten...',
        ephemeral: true
    });
}

// Category select handler
async function handleCategorySelect(interaction) {
    const category = interaction.values[0];
    
    const modal = new ModalBuilder()
        .setCustomId(`ticket_modal_${category}`)
        .setTitle(`${ticketCategories[category].name}`);
    
    const subjectInput = new TextInputBuilder()
        .setCustomId('subject')
        .setLabel('Onderwerp')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Korte samenvatting van je probleem/vraag')
        .setRequired(true)
        .setMaxLength(100);
    
    const descriptionInput = new TextInputBuilder()
        .setCustomId('description')
        .setLabel('Beschrijving')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Geef een gedetailleerde beschrijving van je probleem/vraag')
        .setRequired(false)
        .setMaxLength(1000);
    
    const firstRow = new ActionRowBuilder().addComponents(subjectInput);
    const secondRow = new ActionRowBuilder().addComponents(descriptionInput);
    
    modal.addComponents(firstRow, secondRow);
    
    await interaction.showModal(modal);
}

// Modal submit handler
async function handleTicketModal(interaction) {
    const category = interaction.customId.split('_')[2];
    const subject = interaction.fields.getTextInputValue('subject');
    const description = interaction.fields.getTextInputValue('description') || null;
    
    await interaction.deferReply({ ephemeral: true });
    await createTicket(interaction, category, subject, description);
}

// Close ticket function
async function closeTicket(ticketData, closedBy, reason) {
    try {
        ticketData.status = 'closed';
        ticketData.closedBy = closedBy.id;
        ticketData.closedAt = Date.now();
        ticketData.closeReason = reason;
        tickets.set(ticketData.id, ticketData);
        
        const channel = client.channels.cache.get(ticketData.channelId);
        if (!channel) return;
        
        // Generate transcript if enabled
        let transcript = null;
        if (config.transcriptEnabled) {
            try {
                transcript = await generateTranscript(channel, ticketData);
            } catch (error) {
                console.error('Error generating transcript:', error);
            }
        }
        
        // Send closing message
        const closeEmbed = new EmbedBuilder()
            .setTitle('🔒 Ticket Gesloten')
            .setDescription(`Dit ticket is gesloten door ${closedBy}`)
            .setColor('#ff0000')
            .addFields(
                { name: '📝 Reden', value: reason, inline: false },
                { name: '📅 Gesloten op', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
            )
            .setTimestamp();
        
        await channel.send({ embeds: [closeEmbed] });
        
        // Send transcript to transcript channel
        if (transcript && config.transcriptChannelId) {
            const transcriptChannel = client.channels.cache.get(config.transcriptChannelId);
            if (transcriptChannel) {
                const transcriptEmbed = new EmbedBuilder()
                    .setTitle(`📄 Transcript - ${ticketData.id}`)
                    .setDescription(`**Categorie:** ${ticketCategories[ticketData.category].name}\n**Onderwerp:** ${ticketData.subject}\n**Eigenaar:** <@${ticketData.userId}>\n**Gesloten door:** ${closedBy}`)
                    .setColor('#0099ff')
                    .setTimestamp();
                
                await transcriptChannel.send({
                    embeds: [transcriptEmbed],
                    files: [transcript]
                });
            }
        }
        
        // Log action
        await logTicketAction('close', closedBy, ticketData, reason);
        
        // Delete channel after 10 seconds
        setTimeout(async () => {
            try {
                await channel.delete();
            } catch (error) {
                console.error('Error deleting ticket channel:', error);
            }
        }, 10000);
        
    } catch (error) {
        console.error('Error closing ticket:', error);
    }
}

// Generate transcript function
async function generateTranscript(channel, ticketData) {
    const messages = await channel.messages.fetch({ limit: 100 });
    const sortedMessages = messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    
    let transcript = `Ticket Transcript: ${ticketData.id}\n`;
    transcript += `Categorie: ${ticketCategories[ticketData.category].name}\n`;
    transcript += `Onderwerp: ${ticketData.subject}\n`;
    transcript += `Eigenaar: ${client.users.cache.get(ticketData.userId)?.tag || 'Onbekend'}\n`;
    transcript += `Aangemaakt: ${new Date(ticketData.createdAt).toLocaleString('nl-NL')}\n`;
    if (ticketData.closedAt) {
        transcript += `Gesloten: ${new Date(ticketData.closedAt).toLocaleString('nl-NL')}\n`;
        transcript += `Gesloten door: ${client.users.cache.get(ticketData.closedBy)?.tag || 'Onbekend'}\n`;
    }
    transcript += `\n${'='.repeat(50)}\n\n`;
    
    for (const message of sortedMessages.values()) {
        const timestamp = new Date(message.createdTimestamp).toLocaleString('nl-NL');
        transcript += `[${timestamp}] ${message.author.tag}: ${message.content}\n`;
        
        if (message.attachments.size > 0) {
            message.attachments.forEach(attachment => {
                transcript += `    📎 Bijlage: ${attachment.name} (${attachment.url})\n`;
            });
        }
        
        if (message.embeds.length > 0) {
            message.embeds.forEach(embed => {
                transcript += `    📋 Embed: ${embed.title || 'Geen titel'}\n`;
                if (embed.description) transcript += `    ${embed.description}\n`;
            });
        }
        
        transcript += '\n';
    }
    
    const buffer = Buffer.from(transcript, 'utf8');
    return {
        attachment: buffer,
        name: `transcript-${ticketData.id}-${Date.now()}.txt`
    };
}

// Get ticket by channel ID
function getTicketByChannel(channelId) {
    for (const ticket of tickets.values()) {
        if (ticket.channelId === channelId) {
            return ticket;
        }
    }
    return null;
}

// Log ticket actions
async function logTicketAction(action, user, ticketData, details = null) {
    try {
        const logChannel = client.channels.cache.get(config.logChannelId);
        if (!logChannel) return;
        
        let title, color, description;
        
        switch (action) {
            case 'create':
                title = '🎫 Ticket Aangemaakt';
                color = '#00ff00';
                description = `**Ticket:** ${ticketData.id}\n**Gebruiker:** <@${user.id}>\n**Categorie:** ${ticketCategories[ticketData.category].name}\n**Onderwerp:** ${ticketData.subject}`;
                break;
            case 'close':
                title = '🔒 Ticket Gesloten';
                color = '#ff0000';
                description = `**Ticket:** ${ticketData.id}\n**Gesloten door:** <@${user.id}>\n**Reden:** ${details}`;
                break;
            case 'add_user':
                title = '➕ Gebruiker Toegevoegd';
                color = '#00ff00';
                description = `**Ticket:** ${ticketData.id}\n**Toegevoegd door:** <@${user.id}>\n**Details:** ${details}`;
                break;
            case 'remove_user':
                title = '➖ Gebruiker Verwijderd';
                color = '#ff9500';
                description = `**Ticket:** ${ticketData.id}\n**Verwijderd door:** <@${user.id}>\n**Details:** ${details}`;
                break;
            case 'rename':
                title = '✏️ Ticket Hernoemd';
                color = '#0099ff';
                description = `**Ticket:** ${ticketData.id}\n**Hernoemd door:** <@${user.id}>\n**Details:** ${details}`;
                break;
        }
        
        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor(color)
            .setTimestamp();
        
        await logChannel.send({ embeds: [embed] });
        
    } catch (error) {
        console.error('Error logging ticket action:', error);
    }
}

// Check for inactive tickets
async function checkInactiveTickets() {
    const now = Date.now();
    
    for (const [ticketId, ticketData] of tickets.entries()) {
        if (ticketData.status === 'open' && 
            (now - ticketData.lastActivity) > config.ticketAutoClose) {
            
            const channel = client.channels.cache.get(ticketData.channelId);
            if (channel) {
                const embed = new EmbedBuilder()
                    .setTitle('⚠️ Inactief Ticket')
                    .setDescription('Dit ticket wordt over 1 uur automatisch gesloten vanwege inactiviteit.\n\nStuur een bericht om dit te voorkomen.')
                    .setColor('#ffaa00')
                    .setTimestamp();
                
                await channel.send({ 
                    content: `<@${ticketData.userId}>`,
                    embeds: [embed] 
                });
                
                // Close after 1 hour of warning
                setTimeout(async () => {
                    const updatedTicket = tickets.get(ticketId);
                    if (updatedTicket && updatedTicket.status === 'open' &&
                        (Date.now() - updatedTicket.lastActivity) > (config.ticketAutoClose + 3600000)) {
                        await closeTicket(updatedTicket, client.user, 'Automatisch gesloten vanwege inactiviteit');
                    }
                }, 3600000); // 1 hour
            }
        }
    }
}

// Track message activity in tickets
client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (!message.guild) return;
    
    const ticketData = getTicketByChannel(message.channel.id);
    if (ticketData && ticketData.status === 'open') {
        ticketData.lastActivity = Date.now();
        tickets.set(ticketData.id, ticketData);
    }
});

// Error handling
client.on('error', console.error);
client.on('warn', console.warn);

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('SIGINT', () => {
    console.log('Bot wordt afgesloten...');
    saveData();
    client.destroy();
    process.exit(0);
});

// Start de bot
client.login(config.token);

module.exports = { client, config, tickets, userTickets };
