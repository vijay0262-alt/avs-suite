/**
 * ThreatKnowledgeBase — reusable explanations for every threat category.
 *
 * Provides user-friendly, evidence-based explanations for:
 *   - Spyware, Adware, PUP, Browser hijackers
 *   - Persistence, PowerShell abuse, Credential theft
 *   - Crypto miners, LOLBins, Script abuse
 *   - Unsigned executables, Unknown publishers
 *
 * The AI must never invent information. These are curated, static
 * knowledge entries that provide context to detected threats.
 */
import type { KnowledgeBaseEntry, ThreatCategory } from './types';

const ENTRIES: Record<ThreatCategory, KnowledgeBaseEntry> = {
  spyware: {
    category: 'spyware',
    name: 'Spyware',
    userFriendlyName: 'Spyware — Silent Data Theft',
    description: 'Software that secretly monitors your activity and collects data without your knowledge.',
    whatIsIt: 'Spyware is a type of malicious software that covertly monitors your computer activity — including keystrokes, clipboard contents, screen captures, and browser data — and sends this information to a remote party without your consent.',
    howItWorks: 'Spyware typically installs itself silently, often bundled with other software. Once active, it hooks into system APIs to capture keyboard input, clipboard data, screen content, microphone audio, or camera video. The collected data is then transmitted to a remote server.',
    whyDangerous: 'Spyware can steal passwords, banking credentials, personal photos, confidential documents, and private conversations. The stolen data can be used for identity theft, financial fraud, or blackmail.',
    commonIndicators: [
      'Keyboard hook registration',
      'Clipboard monitoring activity',
      'Screen capture API calls',
      'Microphone or camera access without user action',
      'Browser credential database access',
      'Suspicious persistence mechanisms',
    ],
    mitreTechniques: ['T1003 (Credential Dumping)', 'T1115 (Clipboard Data)', 'T1113 (Screen Capture)', 'T1056.001 (Keylogging)', 'T1123 (Audio Capture)', 'T1125 (Video Capture)'],
    preventionTips: [
      'Install software only from trusted sources',
      'Use a reputable antivirus with behavior monitoring',
      'Review installed programs regularly',
      'Be cautious of email attachments and downloads',
    ],
    falsePositiveScenarios: [
      'Legitimate screen recording software (OBS, Snagit)',
      'Accessibility tools that monitor keyboard input',
      'Password managers that access browser credential stores',
      'Video conferencing apps with camera/microphone access',
    ],
    severityGuidance: 'High severity — spyware indicates active data theft. Multiple indicators significantly increase confidence.',
  },

  adware: {
    category: 'adware',
    name: 'Adware',
    userFriendlyName: 'Adware — Unwanted Advertising',
    description: 'Software that displays unwanted advertisements, often injecting ads into web pages or generating popups.',
    whatIsIt: 'Adware is software that automatically displays or downloads advertising material — often as popups, injected ads in web pages, or system notifications. It may also modify browser settings to redirect you to advertising sites.',
    howItWorks: 'Adware typically installs via bundled software or browser extensions. Once active, it injects advertisements into web pages, generates popup windows, modifies browser homepage and search engine settings, or abuses notification permissions to display ads.',
    whyDangerous: 'While less dangerous than spyware, adware degrades browsing experience, slows down the system, and may expose you to malicious advertisements. Some adware also collects browsing data for targeted advertising.',
    commonIndicators: [
      'Advertisement injection in web pages',
      'Unwanted popup windows',
      'Browser notification spam',
      'Homepage changed without user action',
      'Search engine replaced with unknown provider',
      'Browser toolbar installed without consent',
    ],
    mitreTechniques: ['T1176 (Browser Extensions)'],
    preventionTips: [
      'Pay attention during software installation — decline bundled offers',
      'Review browser extensions regularly',
      'Check notification permissions in browser settings',
      'Restore browser settings if homepage or search engine changes unexpectedly',
    ],
    falsePositiveScenarios: [
      'Legitimate browser extensions that display contextual information',
      'Free software supported by advertising (with clear disclosure)',
      'Browser notification subscriptions the user intentionally granted',
    ],
    severityGuidance: 'Low to medium severity — annoying but rarely causes data loss. Browser hijacking increases severity.',
  },

  pup: {
    category: 'pup',
    name: 'PUP (Potentially Unwanted Program)',
    userFriendlyName: 'PUP — Potentially Unwanted Program',
    description: 'Software that users may not want installed — bundled installers, fake optimizers, driver updater scams.',
    whatIsIt: 'A Potentially Unwanted Program (PUP) is software that may not be explicitly malicious but is installed without clear consent or uses deceptive practices. This includes bundled installers, fake system optimizers, driver updater scams, and fake antivirus software.',
    howItWorks: 'PUPs typically install via bundled offers in other software installers. They may use deceptive UI patterns (pre-checked consent boxes, confusing language) to trick users into installing. Once installed, they display fake warnings, slow performance, or nag screens to upsell paid versions.',
    whyDangerous: 'PUPs slow down your system, display misleading warnings, may collect browsing data, and can be difficult to uninstall. Fake antivirus programs may block legitimate security software.',
    commonIndicators: [
      'Bundled with other software',
      'Fake system optimization warnings',
      'Driver updater with aggressive upselling',
      'Fake antivirus alerts',
      'Crypto mining bundled in software',
      'Download manager with additional bundled software',
    ],
    mitreTechniques: ['T1583.004 (Cryptocurrency Mining)', 'T1204.002 (Malicious File)'],
    preventionTips: [
      'Always choose custom installation and decline bundled offers',
      'Research software before installing',
      'Be skeptical of "free" system optimizers',
      'Use reputable download sources',
    ],
    falsePositiveScenarios: [
      'Legitimate system optimization tools',
      'Genuine driver update utilities from hardware manufacturers',
      'Free software with clear advertising disclosure',
    ],
    severityGuidance: 'Low severity — nuisance software. Fake antivirus and crypto mining bundles increase severity.',
  },

  browser_hijacker: {
    category: 'browser_hijacker',
    name: 'Browser Hijacker',
    userFriendlyName: 'Browser Hijacker — Unauthorized Browser Changes',
    description: 'Software that modifies browser settings — homepage, search engine, new tab page — without user consent.',
    whatIsIt: 'A browser hijacker modifies your browser settings without your knowledge or consent. It changes your homepage, default search engine, or new tab page, often redirecting you to advertising or potentially malicious sites.',
    howItWorks: 'Browser hijackers typically install as browser extensions or modify browser configuration files. They change homepage and search engine settings, inject ads into search results, and may prevent users from restoring original settings.',
    whyDangerous: 'Browser hijackers redirect you to potentially malicious sites, expose you to unwanted advertising, and may collect browsing data. Some hijackers are difficult to remove and reinstall themselves automatically.',
    commonIndicators: [
      'Homepage changed without user action',
      'Search engine replaced with unknown provider',
      'New tab page redirected',
      'Suspicious browser extensions installed',
      'Notification permissions granted to unknown sites',
      'Proxy settings modified',
      'Certificate anomalies detected',
    ],
    mitreTechniques: ['T1176 (Browser Extensions)', 'T1547 (Boot or Logon Autostart Execution)'],
    preventionTips: [
      'Review browser extensions before installing',
      'Check extension permissions and publisher',
      'Restore browser settings if changes occur unexpectedly',
      'Be cautious of "free" browser utilities',
    ],
    falsePositiveScenarios: [
      'Legitimate browser extensions that modify new tab page (with user consent)',
      'Organization-managed browser settings',
      'Legitimate search engine changes by user preference',
    ],
    severityGuidance: 'Medium severity — affects browsing security and privacy. Multiple unauthorized changes increase severity.',
  },

  crypto_miner: {
    category: 'crypto_miner',
    name: 'Cryptocurrency Miner',
    userFriendlyName: 'Crypto Miner — Unauthorized Mining',
    description: 'Software that uses your computer resources to mine cryptocurrency without your consent.',
    whatIsIt: 'A cryptocurrency miner uses your computer CPU and/or GPU to perform complex calculations for cryptocurrency mining. When installed without consent, it steals your computing resources and electricity for someone else profit.',
    howItWorks: 'Crypto miners connect to mining pools via stratum protocol and begin performing hash calculations. They consume high CPU and/or GPU resources, causing system slowdown, increased heat, and higher electricity bills.',
    whyDangerous: 'Crypto miners cause system slowdown, overheating, reduced hardware lifespan, and increased electricity costs. They may also be bundled with other malware.',
    commonIndicators: [
      'High CPU usage with no visible application',
      'High GPU usage when idle',
      'Connections to known mining pools',
      'Process names matching known miners (xmrig, claymore, etc.)',
      'Stratum protocol connections',
    ],
    mitreTechniques: ['T1583.004 (Cryptocurrency Mining)'],
    preventionTips: [
      'Monitor CPU and GPU usage for unexpected spikes',
      'Be cautious of "free" software that may bundle miners',
      'Use browser extensions that block mining scripts',
      'Review running processes for unfamiliar names',
    ],
    falsePositiveScenarios: [
      'Legitimate cryptocurrency mining software installed intentionally',
      'High-performance computing applications',
      'Video rendering or 3D modeling software using GPU',
    ],
    severityGuidance: 'Medium severity — resource theft. Pool connections with known miner names increase severity.',
  },

  malware: {
    category: 'malware',
    name: 'Malware',
    userFriendlyName: 'Malware — Malicious Software',
    description: 'General malicious software that may perform harmful actions on your system.',
    whatIsIt: 'Malware is any software intentionally designed to cause harm — including stealing data, disrupting operations, gaining unauthorized access, or damaging the system.',
    howItWorks: 'Malware can use various techniques: process injection, code obfuscation, privilege escalation, and persistence mechanisms. It may download additional payloads, communicate with command-and-control servers, or spread to other systems.',
    whyDangerous: 'Malware can steal data, encrypt files (ransomware), damage the operating system, spy on activity, or use your system to attack others.',
    commonIndicators: [
      'Process injection behavior',
      'Rapid child process creation',
      'Self-replication indicators',
      'Excessive privilege requests',
      'Unexpected service creation',
    ],
    mitreTechniques: ['T1055 (Process Injection)', 'T1059 (Command and Scripting Interpreter)', 'T1543 (Create or Modify System Process)'],
    preventionTips: [
      'Keep your operating system and software updated',
      'Use reputable antivirus with behavior monitoring',
      'Do not open email attachments from unknown senders',
      'Use a firewall to monitor network connections',
    ],
    falsePositiveScenarios: [
      'Legitimate software with aggressive behavior (debuggers, performance tools)',
      'System administration tools',
      'Software with poor coding practices',
    ],
    severityGuidance: 'High to critical severity — active malicious behavior. Process injection significantly increases severity.',
  },

  trojans: {
    category: 'trojans',
    name: 'Trojan',
    userFriendlyName: 'Trojan — Disguised Malware',
    description: 'Malware disguised as legitimate software.',
    whatIsIt: 'A trojan is malware that disguises itself as legitimate software to trick users into installing it. Once installed, it can perform malicious actions such as stealing data, downloading additional malware, or providing remote access.',
    howItWorks: 'Trojans mimic the appearance of legitimate applications. Once executed, they perform their hidden malicious functions while the user believes they are using a legitimate program.',
    whyDangerous: 'Trojans can steal sensitive data, create backdoors for remote access, download additional malware, and compromise system security.',
    commonIndicators: [
      'Software from untrusted sources',
      'Unexpected network connections',
      'Files with mismatched names and behavior',
      'Unsigned executables mimicking known software',
    ],
    mitreTechniques: ['T1204.002 (Malicious File)', 'T1055 (Process Injection)'],
    preventionTips: [
      'Download software only from official sources',
      'Verify digital signatures before executing',
      'Scan downloaded files before opening',
    ],
    falsePositiveScenarios: [
      'Legitimate software with similar names to known trojans',
      'Custom-built applications without signatures',
    ],
    severityGuidance: 'High severity — trojans indicate active compromise.',
  },

  ransomware: {
    category: 'ransomware',
    name: 'Ransomware',
    userFriendlyName: 'Ransomware — File Encryption Attack',
    description: 'Malware that encrypts your files and demands payment for decryption.',
    whatIsIt: 'Ransomware is malware that encrypts your files or locks your system, then demands payment (ransom) to restore access. It is one of the most destructive types of malware.',
    howItWorks: 'Ransomware typically arrives via email attachments, malicious downloads, or exploit kits. Once executed, it rapidly encrypts files using strong encryption, displays a ransom note, and may delete backup copies.',
    whyDangerous: 'Ransomware can cause permanent data loss, financial extortion, and complete system lockdown. Even paying the ransom does not guarantee file recovery.',
    commonIndicators: [
      'Mass file encryption activity',
      'Ransom note files created',
      'Shadow copy deletion attempts',
      'Rapid file modification patterns',
    ],
    mitreTechniques: ['T1486 (Data Encrypted for Impact)', 'T1490 (Inhibit System Recovery)'],
    preventionTips: [
      'Maintain regular offline backups',
      'Keep software and OS updated',
      'Do not open suspicious email attachments',
      'Use ransomware protection features',
    ],
    falsePositiveScenarios: [
      'Legitimate file encryption software (VeraCrypt, BitLocker)',
      'Backup software performing mass file operations',
    ],
    severityGuidance: 'Critical severity — immediate action required.',
  },

  keylogger: {
    category: 'keylogger',
    name: 'Keylogger',
    userFriendlyName: 'Keylogger — Keyboard Surveillance',
    description: 'Software that records every keystroke you make.',
    whatIsIt: 'A keylogger is software that records every key you press on your keyboard. This includes passwords, credit card numbers, private messages, and other sensitive information.',
    howItWorks: 'Keyloggers install keyboard hooks at the operating system level, intercepting all keystrokes before they reach the intended application. The recorded data is saved locally or transmitted to a remote server.',
    whyDangerous: 'Keyloggers can capture passwords, banking credentials, personal communications, and any other typed information. This data enables identity theft and financial fraud.',
    commonIndicators: [
      'Keyboard hook registration',
      'Suspicious log files with keystroke data',
      'Processes accessing keyboard APIs',
      'Network transmission of captured data',
    ],
    mitreTechniques: ['T1056.001 (Keylogging)'],
    preventionTips: [
      'Use on-screen keyboards for sensitive input',
      'Install reputable security software',
      'Be cautious of software that requests keyboard access',
    ],
    falsePositiveScenarios: [
      'Accessibility software (screen readers, input assistants)',
      'Gaming software with macro recording',
      'Parental control software',
    ],
    severityGuidance: 'High severity — active credential theft.',
  },

  rootkit: {
    category: 'rootkit',
    name: 'Rootkit',
    userFriendlyName: 'Rootkit — Deep System Compromise',
    description: 'Malware that hides itself at the operating system kernel level.',
    whatIsIt: 'A rootkit is malware that operates at the deepest level of the operating system (kernel or bootloader), making it extremely difficult to detect and remove.',
    howItWorks: 'Rootkits modify the operating system kernel or boot process to hide their presence. They can intercept system calls, hide files and processes, and maintain persistent access.',
    whyDangerous: 'Rootkits are extremely difficult to detect and remove. They can hide other malware, maintain permanent access, and survive system reinstalls if the boot process is compromised.',
    commonIndicators: [
      'Kernel-mode driver installation',
      'Boot process modification',
      'Hidden processes or files',
      'System call hooking',
    ],
    mitreTechniques: ['T1014 (Rootkit)', 'T1547.006 (Kernel Modules)'],
    preventionTips: [
      'Use secure boot features',
      'Keep kernel-level security enabled',
      'Regular system integrity checks',
    ],
    falsePositiveScenarios: [
      'Legitimate security software with kernel drivers',
      'Virtualization software',
      'Hardware drivers with kernel access',
    ],
    severityGuidance: 'Critical severity — deep system compromise.',
  },

  bootkit: {
    category: 'bootkit',
    name: 'Bootkit',
    userFriendlyName: 'Bootkit — Boot Process Attack',
    description: 'Malware that infects the boot process before the operating system loads.',
    whatIsIt: 'A bootkit is malware that infects the master boot record or boot partition, allowing it to load before the operating system and gain deep system access.',
    howItWorks: 'Bootkits modify the boot sector or bootloader to execute malicious code before the operating system. This gives them kernel-level access and makes them very difficult to detect.',
    whyDangerous: 'Bootkits survive operating system reinstalls, can hide other malware, and are extremely difficult to remove without specialized tools.',
    commonIndicators: [
      'Boot sector modification',
      'Bootloader changes',
      'Pre-boot execution anomalies',
    ],
    mitreTechniques: ['T1542 (Pre-OS Boot)', 'T1542.003 (Bootkit)'],
    preventionTips: [
      'Enable Secure Boot',
      'Use UEFI firmware',
      'Regular boot integrity checks',
    ],
    falsePositiveScenarios: [
      'Legitimate boot managers (GRUB, rEFInd)',
      'Disk encryption software (BitLocker)',
    ],
    severityGuidance: 'Critical severity — survives OS reinstall.',
  },

  backdoor: {
    category: 'backdoor',
    name: 'Backdoor',
    userFriendlyName: 'Backdoor — Remote Access',
    description: 'Software that provides remote access to your system without your knowledge.',
    whatIsIt: 'A backdoor is software that creates a hidden entry point for remote access to your system, allowing an attacker to control your computer without your knowledge.',
    howItWorks: 'Backdoors open network ports, establish reverse connections, or create hidden channels for remote command execution. They may use encryption to avoid detection.',
    whyDangerous: 'Backdoors provide full remote access to your system, enabling data theft, surveillance, additional malware installation, and use of your system in attacks against others.',
    commonIndicators: [
      'Unexpected listening ports',
      'Beacon-like network behavior',
      'Remote command execution patterns',
      'Hidden network connections',
    ],
    mitreTechniques: ['T1071 (Application Layer Protocol)', 'T1571 (Non-Standard Port)', 'T1572 (Protocol Tunneling)'],
    preventionTips: [
      'Use a firewall',
      'Monitor network connections',
      'Keep software updated',
      'Be cautious of remote access software',
    ],
    falsePositiveScenarios: [
      'Legitimate remote access tools (TeamViewer, AnyDesk)',
      'System administration tools',
      'Cloud sync applications',
    ],
    severityGuidance: 'High to critical severity — active remote access.',
  },

  dropper: {
    category: 'dropper',
    name: 'Dropper',
    userFriendlyName: 'Dropper — Malware Delivery',
    description: 'Software designed to download and install other malware.',
    whatIsIt: 'A dropper is malware whose primary purpose is to download and install other malware onto your system. It may appear harmless itself but serves as a delivery mechanism.',
    howItWorks: 'Droppers connect to remote servers, download malware payloads, and execute them. They may use obfuscation to avoid detection and may persist to ensure payload delivery.',
    whyDangerous: 'Droppers are the first stage of many malware infections. They can deliver ransomware, spyware, backdoors, or any other type of malware.',
    commonIndicators: [
      'Downloads from suspicious URLs',
      'Executable files created in temp directories',
      'Process creation from downloaded files',
      'Encoded PowerShell download commands',
    ],
    mitreTechniques: ['T1105 (Ingress Tool Transfer)', 'T1059.001 (PowerShell)'],
    preventionTips: [
      'Scan all downloaded files',
      'Monitor temp directory for unexpected executables',
      'Block suspicious network connections',
    ],
    falsePositiveScenarios: [
      'Legitimate software updaters',
      'Package managers',
      'Game launchers downloading updates',
    ],
    severityGuidance: 'High severity — precursor to serious infection.',
  },

  downloader: {
    category: 'downloader',
    name: 'Downloader',
    userFriendlyName: 'Downloader — Malware Fetcher',
    description: 'A lightweight malware component that downloads additional payloads.',
    whatIsIt: 'A downloader is a small malware component designed specifically to download and execute additional malware. It is often the first stage of a multi-stage attack.',
    howItWorks: 'Downloaders connect to command-and-control servers, retrieve additional malware components, and execute them. They are typically small and simple to avoid detection.',
    whyDangerous: 'Downloaders serve as the initial foothold for more sophisticated malware, including ransomware and backdoors.',
    commonIndicators: [
      'Small executables with network activity',
      'Downloads from unknown servers',
      'Execution of downloaded payloads',
    ],
    mitreTechniques: ['T1105 (Ingress Tool Transfer)'],
    preventionTips: [
      'Monitor network connections from unknown processes',
      'Block execution from temp directories',
      'Use application whitelisting',
    ],
    falsePositiveScenarios: [
      'Legitimate software update mechanisms',
      'Cloud applications downloading components',
    ],
    severityGuidance: 'High severity — initial infection stage.',
  },

  unsafe_script: {
    category: 'unsafe_script',
    name: 'Unsafe Script',
    userFriendlyName: 'Unsafe Script — Malicious Code Execution',
    description: 'A script (PowerShell, VBScript, batch, macro) that exhibits malicious behavior.',
    whatIsIt: 'An unsafe script is a script file — PowerShell, VBScript, JavaScript, batch, or document macro — that contains code designed to perform malicious actions such as downloading malware, modifying system settings, or executing commands.',
    howItWorks: 'Malicious scripts use encoded commands, obfuscation, and living-off-the-land binaries to evade detection. They may download payloads, modify registry, create scheduled tasks, or establish persistence.',
    whyDangerous: 'Scripts can execute powerful system commands, download malware, establish persistence, and bypass security measures. They are a common attack vector via email attachments and malicious documents.',
    commonIndicators: [
      'Encoded PowerShell commands',
      'Download cradles (IEX, DownloadString)',
      'Execution policy bypass flags',
      'WScript.Shell or Shell() calls from macros',
      'BITSAdmin or CertUtil for downloads',
      'Obfuscated script content',
    ],
    mitreTechniques: ['T1059 (Command and Scripting Interpreter)', 'T1059.001 (PowerShell)', 'T1204.002 (Malicious File)'],
    preventionTips: [
      'Do not enable macros in documents from untrusted sources',
      'Review PowerShell execution policies',
      'Be cautious of script files from emails',
      'Use script logging and monitoring',
    ],
    falsePositiveScenarios: [
      'Legitimate administrative scripts',
      'Software installers using PowerShell',
      'IT automation scripts',
      'Development build scripts',
    ],
    severityGuidance: 'Medium to high severity — encoded commands and download cradles increase severity significantly.',
  },

  suspicious_scheduled_task: {
    category: 'suspicious_scheduled_task',
    name: 'Suspicious Scheduled Task',
    userFriendlyName: 'Suspicious Scheduled Task — Persistence Mechanism',
    description: 'A scheduled task that appears designed for malware persistence rather than legitimate use.',
    whatIsIt: 'A suspicious scheduled task is a Windows Task Scheduler entry that exhibits indicators of being created by malware for persistence — running malicious commands at regular intervals or at system startup.',
    howItWorks: 'Malware creates scheduled tasks to ensure it runs automatically — at logon, at startup, or at regular intervals. These tasks may execute encoded PowerShell commands, run binaries from temp directories, or perform other malicious actions.',
    whyDangerous: 'Scheduled tasks provide persistent malware execution that survives reboots. Hidden tasks are particularly dangerous as they are invisible in the standard Task Scheduler UI.',
    commonIndicators: [
      'Hidden task properties',
      'No author metadata',
      'Encoded PowerShell commands',
      'Execution from temp or appdata directories',
      'Logon or boot triggers with unknown author',
    ],
    mitreTechniques: ['T1053 (Scheduled Task/Job)'],
    preventionTips: [
      'Review scheduled tasks regularly',
      'Check for hidden tasks',
      'Verify task authors and commands',
    ],
    falsePositiveScenarios: [
      'Legitimate software update tasks (Microsoft, Google, Adobe)',
      'System maintenance tasks',
      'Backup software scheduled tasks',
    ],
    severityGuidance: 'Medium to high severity — encoded commands and hidden tasks increase severity.',
  },

  suspicious_service: {
    category: 'suspicious_service',
    name: 'Suspicious Service',
    userFriendlyName: 'Suspicious Service — Privilege Abuse',
    description: 'A Windows service that appears malicious — unsigned, running as SYSTEM, or from suspicious locations.',
    whatIsIt: 'A suspicious service is a Windows service that exhibits indicators of being malicious — unsigned executables, running with SYSTEM privileges, or installed from suspicious locations like temp directories.',
    howItWorks: 'Malware installs Windows services for persistence and privilege escalation. Services running as LocalSystem have full system access. Unsigned services from temp directories are strong indicators of compromise.',
    whyDangerous: 'Malicious services have system-level access, start automatically, and are difficult to remove. Services running as SYSTEM can perform any action on the system.',
    commonIndicators: [
      'Unsigned service binary',
      'Unknown publisher',
      'Service binary in temp or appdata',
      'Running as LocalSystem without signature',
      'Auto-start with no known publisher',
    ],
    mitreTechniques: ['T1543.003 (Windows Service)'],
    preventionTips: [
      'Review installed services regularly',
      'Verify service publishers and signatures',
      'Check service binary paths',
    ],
    falsePositiveScenarios: [
      'Legitimate services from known vendors',
      'Custom in-house software services',
      'Development tools with services',
    ],
    severityGuidance: 'Medium to high severity — SYSTEM + unsigned increases severity significantly.',
  },

  suspicious_startup_entry: {
    category: 'suspicious_startup_entry',
    name: 'Suspicious Startup Entry',
    userFriendlyName: 'Suspicious Startup Entry — Auto-Start Abuse',
    description: 'A startup entry that appears designed for malware persistence.',
    whatIsIt: 'A suspicious startup entry is a program configured to run automatically at system startup that exhibits indicators of being malicious — unsigned executables, suspicious command patterns, or unknown publishers.',
    howItWorks: 'Malware adds entries to the startup folder or registry Run/RunOnce keys to execute automatically at logon. These entries may use suspicious command patterns like encoded PowerShell, rundll32, or mshta.',
    whyDangerous: 'Startup entries provide persistent malware execution at every logon. Suspicious command patterns may download additional payloads or modify system settings.',
    commonIndicators: [
      'Unsigned executable in startup folder',
      'Registry Run key with unknown publisher',
      'Suspicious command patterns (powershell -enc, cmd /c, rundll32)',
      'RunOnce key with unsigned executable',
      'Startup entry in temp or appdata',
    ],
    mitreTechniques: ['T1547 (Boot or Logon Autostart Execution)', 'T1547.001 (Registry Run Keys)'],
    preventionTips: [
      'Review startup entries regularly',
      'Check for unknown programs in startup folder',
      'Verify Run and RunOnce registry keys',
    ],
    falsePositiveScenarios: [
      'Legitimate software with auto-start (OneDrive, Discord, Steam)',
      'System utilities',
      'Hardware driver utilities',
    ],
    severityGuidance: 'Medium severity — suspicious commands and unsigned executables increase severity.',
  },

  pua: {
    category: 'pua',
    name: 'PUA (Potentially Unwanted Application)',
    userFriendlyName: 'PUA — Potentially Unwanted Application',
    description: 'An application that may be unwanted, similar to PUP.',
    whatIsIt: 'A Potentially Unwanted Application (PUA) is software that may not be explicitly malicious but exhibits behaviors that users may not want — aggressive advertising, data collection, or system modification.',
    howItWorks: 'PUAs typically install via bundled offers or deceptive download pages. They may collect browsing data, display ads, modify system settings, or install additional components.',
    whyDangerous: 'PUAs degrade system performance, compromise privacy, and may expose users to additional risks.',
    commonIndicators: [
      'Bundled installation patterns',
      'Aggressive advertising',
      'Data collection without clear disclosure',
      'System setting modifications',
    ],
    mitreTechniques: ['T1204.002 (Malicious File)'],
    preventionTips: [
      'Use custom installation to decline bundled offers',
      'Research applications before installing',
      'Download from official sources only',
    ],
    falsePositiveScenarios: [
      'Legitimate free software with advertising',
      'Trial versions of commercial software',
    ],
    severityGuidance: 'Low severity — nuisance software.',
  },

  unknown: {
    category: 'unknown',
    name: 'Unknown Threat',
    userFriendlyName: 'Unknown Threat — Requires Investigation',
    description: 'A threat that does not match any known category but exhibits suspicious behavior.',
    whatIsIt: 'An unknown threat is a detection that exhibits suspicious behavior but does not fit neatly into a known threat category. This may indicate a new type of malware or a legitimate program with unusual behavior.',
    howItWorks: 'Unknown threats are flagged when behavior analysis detects suspicious activity that does not match known threat patterns. These require further investigation to determine if they are malicious.',
    whyDangerous: 'Unknown threats may be new or evolving malware. The risk depends on the specific behaviors detected.',
    commonIndicators: [
      'Suspicious behavior without known signature',
      'Unusual system modifications',
      'Unexpected network activity',
      'WMI persistence (rarely used by legitimate software)',
    ],
    mitreTechniques: ['T1546.003 (WMI Event Subscription)', 'T1547 (Boot or Logon Autostart Execution)'],
    preventionTips: [
      'Investigate unknown threats carefully',
      'Check for additional indicators',
      'Monitor for changes in behavior',
    ],
    falsePositiveScenarios: [
      'Legitimate software with unusual behavior',
      'Custom or in-house applications',
      'System administration tools',
    ],
    severityGuidance: 'Variable severity — depends on specific indicators. WMI persistence is always high severity.',
  },
};

export class ThreatKnowledgeBase {
  private entries: Record<ThreatCategory, KnowledgeBaseEntry>;

  constructor() {
    this.entries = { ...ENTRIES };
  }

  get(category: ThreatCategory): KnowledgeBaseEntry | null {
    return this.entries[category] ?? null;
  }

  getAll(): KnowledgeBaseEntry[] {
    return Object.values(this.entries);
  }

  getCategories(): ThreatCategory[] {
    return Object.keys(this.entries) as ThreatCategory[];
  }

  getUserFriendlyName(category: ThreatCategory): string {
    return this.entries[category]?.userFriendlyName ?? 'Unknown Threat';
  }

  getDescription(category: ThreatCategory): string {
    return this.entries[category]?.description ?? 'No description available.';
  }

  getWhatIsIt(category: ThreatCategory): string {
    return this.entries[category]?.whatIsIt ?? 'No information available.';
  }

  getHowItWorks(category: ThreatCategory): string {
    return this.entries[category]?.howItWorks ?? 'No information available.';
  }

  getWhyDangerous(category: ThreatCategory): string {
    return this.entries[category]?.whyDangerous ?? 'Risk level unknown.';
  }

  getCommonIndicators(category: ThreatCategory): string[] {
    return this.entries[category]?.commonIndicators ?? [];
  }

  getMitreTechniques(category: ThreatCategory): string[] {
    return this.entries[category]?.mitreTechniques ?? [];
  }

  getPreventionTips(category: ThreatCategory): string[] {
    return this.entries[category]?.preventionTips ?? [];
  }

  getFalsePositiveScenarios(category: ThreatCategory): string[] {
    return this.entries[category]?.falsePositiveScenarios ?? [];
  }

  getSeverityGuidance(category: ThreatCategory): string {
    return this.entries[category]?.severityGuidance ?? 'Variable severity.';
  }
}
