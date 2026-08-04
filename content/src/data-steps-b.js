window.STEPS_B = [

  /* ══════════════ CHAPTER 9 — NIC & HARDWARE (BRANCH ethernet/wifi) ══════════════ */

  {
    id: 'hw-doorbell',
    chapter: 9,
    title: 'Driver rings the doorbell',
    node: 'ringbuffer',
    from: 'driver',
    mode: 'hw',
    packet: {
      label: 'SYN seq=1128394821 — parked in TX descriptor',
      layers: ['eth', 'ip', 'tcp'],
      fields: {
        eth: { 'Src MAC': '3c:07:54:6a:2b:91', 'Dst MAC': 'a4:91:b1:0c:44:e2', 'EtherType': '0x0800 (IPv4)' },
        ip: { 'Src': '192.168.1.23', 'Dst': '104.18.32.7', 'TTL': '64', 'Proto': '6 (TCP)' },
        tcp: { 'Src Port': '51324', 'Dst Port': '443', 'Seq': '1128394821', 'Flags': 'SYN' }
      }
    },
    state: { mode: 'hw' },
    explain: {
      what: "The driver has filled a TX descriptor: physical address of the frame, its length, and offload flags. Now comes the last thing the CPU ever does with this packet - a single 4-byte MMIO write of the new tail index into the NIC's doorbell register (writel(i, tx_ring->tail)). That uncached write crosses the PCIe bus and tells the silicon: work is waiting.",
      why: "The NIC is an independent processor with its own firmware. Without a doorbell it would have to constantly poll RAM for new descriptors, burning bus cycles. The doorbell inverts that: hardware sleeps until software pokes it.",
      component: 'NIC driver TX ring (drivers/net/ethernet/intel/igb/igb_main.c)',
      layer: 'Kernel/hardware boundary · OSI L2',
      abstraction: 'A producer/consumer ring: software bumps the tail, hardware chases it with the head',
      misconception: '"The kernel sends the packet onto the wire" - it never does. The last CPU instruction involved is a register write; everything after this is done by dedicated silicon.',
      analogy: 'Sticking the order ticket on the kitchen rail and dinging the bell. The chef (NIC) takes it from there - the waiter (CPU) walks away.',
      protocol: 'PCIe posted memory write (MMIO)',
      command: 'ethtool -g eth0        # TX/RX ring sizes (e.g. TX: 256/4096)\nethtool -S eth0 | grep tx_queue',
      production: 'SREs size TX rings (ethtool -G) and watch tx_restart_queue / tx_busy counters. Byte Queue Limits (BQL) caps how many bytes sit in the ring so latency-sensitive packets are not stuck behind a bulk backlog.'
    },
    code: [
      { title: 'The last CPU touch (igb driver)', lang: 'c', code: 'igb_xmit_frame_ring(skb, tx_ring)\n  igb_tx_map(tx_ring, first, hdr_len)\n    dma_map_single(dev, skb->data, len, DMA_TO_DEVICE);\n    tx_desc->read.buffer_addr = cpu_to_le64(dma);\n    /* ... fill cmd_type, olinfo ... */\n    writel(i, tx_ring->tail);   /* ← the doorbell */' }
    ]
  },

  {
    id: 'hw-dma-read',
    chapter: 9,
    title: 'DMA: the NIC pulls the frame out of RAM itself',
    node: 'dma',
    mode: 'hw',
    effects: ['ring-'],
    packet: {
      label: 'SYN frame — streaming over PCIe into the NIC FIFO',
      layers: ['eth', 'ip', 'tcp'],
      fields: {
        eth: { 'Src MAC': '3c:07:54:6a:2b:91', 'Dst MAC': 'a4:91:b1:0c:44:e2', 'EtherType': '0x0800 (IPv4)' },
        ip: { 'Src': '192.168.1.23', 'Dst': '104.18.32.7', 'TTL': '64' },
        tcp: { 'Src Port': '51324', 'Dst Port': '443', 'Flags': 'SYN' }
      }
    },
    explain: {
      what: "The NIC's DMA engine wakes, fetches the descriptor at the head index, then issues PCIe read requests for the frame bytes at the physical address the driver mapped with dma_map_single(). 74 bytes stream from RAM into the NIC's transmit FIFO with zero CPU involvement - no copy loop, no cache pollution. If an IOMMU is active, it translates and validates every bus address on the way.",
      why: "Copying packets with the CPU would burn cores at 10G+ line rates (a core can barely memcpy 10-20 GB/s while doing nothing else). Bus-mastering DMA lets the device read memory directly, which is the only way modern NICs scale.",
      component: 'NIC DMA engine + PCIe root complex + IOMMU (intel_iommu/AMD-Vi)',
      layer: 'Hardware · below OSI, bus level',
      abstraction: 'Devices as first-class citizens of the memory bus - "here is an address, go read it yourself"',
      misconception: '"DMA is a kernel feature" - it is a hardware capability (bus mastering). The kernel only sets up mappings and grants the device permission via the IOMMU.',
      analogy: 'Instead of dictating a letter word by word to the courier, you hand over the desk drawer key and say "third folder". The courier fetches it while you do other work.',
      protocol: 'PCIe Memory Read TLPs (Transaction Layer Packets)',
      command: 'lspci -vv | grep -A2 "Ethernet controller"   # look for BusMaster+\ncat /sys/class/net/eth0/device/numa_node',
      production: 'On NUMA boxes, DMA to the wrong node adds interconnect latency - pin NIC queues and apps to the NIC-local node. IOMMU on/off (intel_iommu=on) trades ~few % throughput for DMA isolation; hypervisors require it.'
    },
    code: [
      { title: 'What just happened on the bus', lang: 'c', code: '/* NIC-side, in silicon: */\n1. doorbell write observed (tail != head)\n2. PCIe MemRd  → TX descriptor #211        (16 bytes)\n3. PCIe MemRd  → frame buffer @ 0x1c3f8a000 (74 bytes)\n4. bytes land in TX FIFO; descriptor marked done (DD bit)\n5. later: IRQ or polled cleanup frees the skb' }
    ]
  },

  {
    id: 'hw-csum-offload',
    chapter: 9,
    title: 'Serialize and checksum — hardware fills in the blanks',
    node: 'nic',
    mode: 'hw',
    packet: {
      label: 'SYN — checksums finalized in hardware',
      layers: ['eth', 'ip', 'tcp'],
      fields: {
        eth: { 'Src MAC': '3c:07:54:6a:2b:91', 'Dst MAC': 'a4:91:b1:0c:44:e2', 'EtherType': '0x0800 (IPv4)' },
        ip: { 'Src': '192.168.1.23', 'Dst': '104.18.32.7', 'TTL': '64', 'Checksum': '0x3c1e (hw-computed)' },
        tcp: { 'Src Port': '51324', 'Dst Port': '443', 'Seq': '1128394821', 'Flags': 'SYN', 'Checksum': '0x8a3f (hw-computed)' }
      }
    },
    quiz: {
      q: 'tcpdump on dev-laptop shows this SYN with "cksum 0x0000 (incorrect)". Is the packet corrupt?',
      options: [
        'Yes - the kernel TCP stack has a checksum bug',
        'No - checksum offload means the NIC computes it AFTER the capture point',
        'Yes - the router will drop it and force a retransmit'
      ],
      answer: 1,
      explain: 'tcpdump taps packets at the kernel (AF_PACKET), before the NIC. With tx-checksumming on, the kernel leaves only a pseudo-header seed (CHECKSUM_PARTIAL) and the NIC fills in the real sum as bytes stream out. On the wire the checksum is correct.'
    },
    explain: {
      what: "The MAC block clocks the frame out of the FIFO bit by bit. As bytes stream past, checksum engines do the work the kernel skipped: the skb was marked CHECKSUM_PARTIAL, so hardware computes the final TCP checksum (the kernel only seeded the pseudo-header sum) and the IP header checksum, patching them into the outgoing byte stream on the fly.",
      why: "Checksumming touches every byte - exactly the kind of dumb repetitive work that should not burn CPU cycles. Offloading it (NETIF_F_HW_CSUM) is decades-old standard practice, and it is why local captures famously show \"incorrect\" checksums.",
      component: 'NIC MAC + checksum offload engine (ethtool -k: tx-checksumming)',
      layer: 'Hardware · OSI L2 (with an L3/L4 assist)',
      abstraction: 'The kernel emits a promise ("checksum goes at offset X"); silicon keeps it',
      misconception: '"Checksum errors in tcpdump on my own box mean corruption" - they mean offload. Corruption shows up on the RECEIVER as drops (RX checksum errors), not on the sender.',
      analogy: 'Signing a stack of letters with a signature stamp at the mailroom door instead of hand-signing each one at your desk.',
      protocol: 'Ethernet framing; TCP/IP checksums (RFC 1071 one’s-complement sum)',
      command: 'ethtool -k eth0 | grep -E "tx-checksumming|scatter-gather|tcp-segmentation"\ntcpdump -i eth0 -vv "tcp[13] & 2 != 0"   # watch SYNs, note cksum remark',
      production: 'Offloads (checksum, TSO, GSO) are usually left on; they get disabled when debugging weird middlebox issues or on virtio paths where they historically caused corruption. ethtool -K lets you toggle per-feature at runtime.'
    },
    code: [
      { title: 'Capture point vs wire', lang: 'bash', code: '$ sudo tcpdump -ni eth0 -vv tcp port 443 &\n$ # our SYN appears:\nIP (tos 0x0, ttl 64, id 41337, flags [DF], proto TCP (6), length 60)\n    192.168.1.23.51324 > 104.18.32.7.443: Flags [S],\n    cksum 0x0000 (incorrect -> 0x8a3f), seq 1128394821,\n    win 64240, options [mss 1460,sackOK,TS,nop,wscale 7]\n# "incorrect" = offloaded. The NIC writes 0x8a3f on the wire.' }
    ]
  },

  {
    id: 'hw-medium-branch',
    chapter: 9,
    title: 'One frame, two physics: cable or air?',
    node: 'nic',
    mode: 'hw',
    branch: {
      key: 'medium',
      question: 'How is dev-laptop actually connected to the home router?',
      options: [
        { value: 'ethernet', label: 'Wired Ethernet (1000BASE-T)', hint: 'Cat6 to the router. Full duplex, dedicated wire, no contention - the frame just goes.' },
        { value: 'wifi', label: 'Wi-Fi (802.11ax, 5 GHz)', hint: 'Shared spectrum: CSMA/CA, per-frame ACKs, WPA3 link encryption, three MAC addresses per frame.' }
      ]
    },
    explain: {
      what: 'Everything above L2 is identical either way - same IP header, same TCP SYN. But layer 1 and the L2 framing diverge completely: a point-to-point electrical link with a private wire, or a shared radio band where every station contends for airtime and every frame must be acknowledged.',
      why: 'This is the cleanest demonstration of layering actually working: TCP genuinely does not know or care whether its bytes rode copper or 5 GHz OFDM symbols. The interface contract (send frame, maybe it arrives) is all that is shared.',
      component: 'NIC PHY selection: 1000BASE-T copper MAC/PHY vs 802.11ax radio + firmware',
      layer: 'Hardware · OSI L1/L2 fork',
      abstraction: 'Same postcard, different postal system',
      misconception: '"Wi-Fi is basically wireless Ethernet" - the 802.11 MAC is far more complex: contention windows, retransmissions, per-frame ACKs, three or four address fields, and link-layer encryption. Ethernet has none of that.',
      analogy: 'A private pneumatic tube to your neighbor vs shouting across a busy cafe - you can say the same sentence, but the cafe needs turn-taking rules and "got it!" confirmations.',
      protocol: 'IEEE 802.3 (Ethernet) vs IEEE 802.11 (Wi-Fi)',
      command: 'ip -br link                # which interfaces exist\nethtool eth0 | grep -E "Speed|Duplex"\niw dev wlan0 link',
      production: 'Wired for anything latency-critical: Wi-Fi adds 1-10 ms of jitter from contention and retries even on a clean channel. Ops teams debugging "slow internet" ask "cable or Wi-Fi?" first for a reason.'
    }
  },

  /* ---------- Ethernet path ---------- */

  {
    id: 'hw-eth-frame',
    chapter: 9,
    title: 'Anatomy of the Ethernet frame',
    node: 'ethframe',
    mode: 'hw',
    when: { medium: 'ethernet' },
    packet: {
      label: 'Ethernet frame — 74 bytes + preamble/FCS overhead',
      layers: ['eth', 'ip', 'tcp'],
      fields: {
        eth: {
          'Preamble': '7 × 10101010 (sync, not counted)',
          'SFD': '10101011 — "frame starts NOW"',
          'Dst MAC': 'a4:91:b1:0c:44:e2 (router)',
          'Src MAC': '3c:07:54:6a:2b:91 (laptop)',
          'EtherType': '0x0800 (IPv4)',
          'FCS': 'CRC-32 over the whole frame'
        },
        ip: { 'Src': '192.168.1.23', 'Dst': '104.18.32.7', 'TTL': '64' },
        tcp: { 'Src Port': '51324', 'Dst Port': '443', 'Seq': '1128394821', 'Flags': 'SYN' }
      }
    },
    explain: {
      what: "On the wire the frame grows bookends: 7 preamble octets of alternating bits so the receiver's clock can lock on, a Start Frame Delimiter marking byte zero, then dst MAC, src MAC, EtherType 0x0800, the 60-byte IP+TCP payload, and a trailing CRC-32 FCS. After the last bit, the transmitter must stay silent for a 96-bit-time interframe gap.",
      why: "The preamble exists because two independent crystal oscillators are never perfectly in sync - the receiver uses the known 1010... pattern to phase-lock before real data arrives. The FCS lets the far end detect corruption with ~1-in-4-billion miss probability and silently drop bad frames.",
      component: 'Ethernet MAC framing (IEEE 802.3 clause 3)',
      layer: 'Hardware · OSI L2',
      abstraction: 'An envelope with a synchronization rattle at the front and a tamper seal at the back',
      misconception: '"Minimum frame is 64 bytes because of some header math" - it is a fossil from 10 Mb/s half-duplex CSMA/CD: a frame had to be long enough to still be transmitting when a collision at the far end of the cable propagated back. Full-duplex links kept the rule anyway.',
      analogy: 'Clearing your throat rhythmically before speaking so the listener tunes to your cadence, then ending with a checksum-like "read it back to yourself".',
      protocol: 'IEEE 802.3 Ethernet II framing',
      command: 'tcpdump -ni eth0 -e -c1 tcp port 443   # -e prints the L2 header\nip -s link show eth0                    # frame/error counters',
      production: 'rx_crc_errors climbing on a switch port almost always means a bad cable, SFP, or duplex mismatch - physical layer problems masquerading as "packet loss". Monitor per-port FCS error counters.'
    },
    code: [
      { title: 'Wire layout (bytes)', lang: 'c', code: '/*  7B preamble | 1B SFD | 6B dst | 6B src | 2B type | 46-1500B payload | 4B FCS  */\n\naa aa aa aa aa aa aa ab          /* preamble + SFD  */\na4 91 b1 0c 44 e2                /* dst: router     */\n3c 07 54 6a 2b 91                /* src: laptop     */\n08 00                            /* EtherType: IPv4 */\n45 00 00 3c ...                  /* IP header, TCP SYN ... */\n1d 9f 3c 7b                      /* FCS (CRC-32)    */' }
    ]
  },

  {
    id: 'hw-eth-phy',
    chapter: 9,
    title: 'PHY: bits become voltages',
    node: 'phy',
    mode: 'hw',
    when: { medium: 'ethernet' },
    effects: ['flash'],
    explain: {
      what: "The 1000BASE-T PHY takes the digital byte stream and encodes it as PAM-5 symbols - five voltage levels (-2,-1,0,+1,+2) - transmitted simultaneously on all four twisted pairs at 125 megasymbols/second each. Both link partners transmit on the same pairs at the same time; DSP echo cancellation subtracts your own signal to hear the other side. The bits are also scrambled so the spectrum stays flat regardless of data patterns.",
      why: "Gigabit over 100 m of cheap copper is a DSP achievement, not a wiring one: 2 bits per symbol per pair × 4 pairs × 125 MBd = 1 Gb/s while staying inside Cat5e's usable bandwidth. PAM-5's fifth level funds forward error correction (4D-TCM).",
      component: 'Ethernet PHY chip (accessed via MDIO; drivers/net/phy/)',
      layer: 'Hardware · OSI L1',
      abstraction: 'A modem for copper: digital bits in, analog waveform out',
      misconception: '"Ethernet sends 1s as high voltage and 0s as low" - that died with 10BASE-T. Gigabit uses five-level symbols on four pairs in both directions simultaneously, with echo cancellation. There is no single wire you could scope and read bits off.',
      analogy: 'Four people talking in both directions at once in the same room, each subtracting the sound of their own voice to hear their partner.',
      protocol: '1000BASE-T (IEEE 802.3 clause 40): PAM-5, 4D-TCM coding',
      command: 'ethtool eth0        # Speed: 1000Mb/s, Duplex: Full, Auto-neg: on\nmii-tool -v eth0    # PHY registers, link partner abilities',
      production: 'Autonegotiation must be on at both ends; hard-forcing speed/duplex on one side causes duplex mismatch - the classic "works but horribly slow under load" ticket, visible as late collisions and CRC errors.'
    },
    code: [
      { title: 'Link diagnostics', lang: 'bash', code: '$ ethtool eth0\nSettings for eth0:\n    Supported link modes:  10baseT/Half ... 1000baseT/Full\n    Speed: 1000Mb/s\n    Duplex: Full\n    Auto-negotiation: on\n    Link detected: yes\n$ ethtool -S eth0 | grep -E "crc|symbol"\n    rx_crc_errors: 0\n    rx_symbol_err: 0' }
    ]
  },

  {
    id: 'hw-eth-wire',
    chapter: 9,
    title: 'On the wire at two-thirds the speed of light',
    node: 'signal',
    mode: 'hw',
    when: { medium: 'ethernet' },
    packet: {
      label: 'Electrical waveform — propagating toward the router',
      layers: ['eth', 'ip', 'tcp'],
      fields: {
        eth: { 'Medium': 'Cat6, 4 twisted pairs', 'Velocity': '~0.66c ≈ 200,000 km/s', 'Serialization': '752 ns for this frame @ 1 Gb/s' },
        ip: { 'Src': '192.168.1.23', 'Dst': '104.18.32.7' },
        tcp: { 'Flags': 'SYN' }
      }
    },
    explain: {
      what: "The waveform races down the twisted pair at roughly two-thirds of light speed - about 5 ns per meter, set by the cable's dielectric (the velocity factor). Over a 15 m run to the router: ~75 ns of propagation. Serializing the 94 on-wire bytes at 1 Gb/s took ~752 ns - on short links, pushing the bits out takes longer than their flight.",
      why: "This is the physics floor under every latency number you will ever measure. Nothing engineered can beat propagation delay - which is why CDNs move servers closer instead of trying to make light faster.",
      component: 'Cat6 UTP cable (the humblest component in the whole stack)',
      layer: 'Physics · OSI L1',
      abstraction: 'Information as a traveling electromagnetic wave guided by copper',
      misconception: '"Electricity travels at the speed of light" - the signal (the field, not the electrons - they drift at cm/s) travels at 60-70% of c in a cable. In fiber it is similar (~68%): glass does not beat copper on speed, it beats it on distance and bandwidth.',
      analogy: 'A wave down a stadium crowd: no person (electron) runs anywhere, yet the wave crosses the stadium in seconds.',
      protocol: 'Transmission-line physics; velocity factor ~0.66 for UTP',
      command: 'ethtool --cable-test eth0     # TDR: uses reflection timing to find cable faults/length\nping -c3 192.168.1.1          # RTT to the router: ~0.3 ms (mostly processing, not flight)',
      production: 'Rule of thumb ops carry everywhere: ~5 μs per km one-way in fiber/copper. A 100 km metro loop costs 1 ms RTT before a single router queue is counted.'
    }
  },

  /* ---------- Wi-Fi path ---------- */

  {
    id: 'hw-wifi-frame',
    chapter: 9,
    title: '802.11: a frame with THREE MAC addresses',
    node: 'wififrame',
    mode: 'hw',
    when: { medium: 'wifi' },
    packet: {
      label: '802.11 QoS Data frame — SYN inside',
      layers: ['wifi', 'ip', 'tcp'],
      fields: {
        wifi: {
          'Frame Control': 'Type=Data, Subtype=QoS Data, ToDS=1',
          'Addr1 (RA)': 'a4:91:b1:0c:44:e2 — receiver: the AP',
          'Addr2 (TA)': '3c:07:54:6a:2b:91 — transmitter: laptop',
          'Addr3 (DA)': 'a4:91:b1:0c:44:e2 — final L2 destination',
          'Duration': 'NAV: airtime reservation (μs)',
          'QoS': 'TID 0 (Best Effort)'
        },
        ip: { 'Src': '192.168.1.23', 'Dst': '104.18.32.7', 'TTL': '64' },
        tcp: { 'Src Port': '51324', 'Dst Port': '443', 'Flags': 'SYN' }
      }
    },
    explain: {
      what: "The Ethernet-style frame is rebuilt as an 802.11 Data frame - and it needs three MAC addresses, because Wi-Fi is a relay system: Addr1 is who should receive this transmission (the AP), Addr2 is who is transmitting (the laptop), Addr3 is the final L2 destination the AP should deliver to. In our case the AP and the router are the same box, so Addr1 and Addr3 coincide. A fourth address slot exists for mesh/WDS bridging.",
      why: "On a wired LAN the medium IS the path. In Wi-Fi, frames hop through the AP, so \"who I'm handing this to\" and \"who it's ultimately for\" are different questions needing different answers. The Duration field additionally reserves airtime so other stations back off (virtual carrier sense, NAV).",
      component: '802.11 MAC layer (mac80211 subsystem + NIC firmware)',
      layer: 'Hardware/firmware · OSI L2',
      abstraction: 'A courier slip with separate "hand to" and "deliver to" lines',
      misconception: '"Wi-Fi frames are Ethernet frames with a radio header" - the 802.11 MAC header is a different format entirely (up to 4 addresses, sequence control, duration/NAV, QoS). The AP translates between 802.11 and 802.3 framing on every single packet.',
      analogy: 'A hotel concierge network: you hand the parcel to the front desk (Addr1) as yourself (Addr2), labeled for its final recipient (Addr3).',
      protocol: 'IEEE 802.11 data frame format',
      command: 'iw dev wlan0 link              # connected AP (BSSID), freq, signal\ntcpdump -i wlan0mon -c2 type data   # needs monitor mode to see 802.11 headers',
      production: "Capture on a normal Wi-Fi interface and you'll see fake Ethernet frames - the kernel translates. Real 802.11 debugging needs a monitor-mode interface plus radiotap headers, ideally on a second machine so you don't observe yourself."
    },
    code: [
      { title: 'Link state', lang: 'bash', code: '$ iw dev wlan0 link\nConnected to a4:91:b1:0c:44:e2 (on wlan0)\n    SSID: HomeNet-5G\n    freq: 5180 (channel 36)\n    RX: 48213456 bytes (39214 packets)\n    TX: 9214332 bytes (18342 packets)\n    signal: -52 dBm\n    tx bitrate: 573.5 MBit/s (HE-MCS 9, 80MHz, HE-NSS 2)' }
    ]
  },

  {
    id: 'hw-wifi-wpa3',
    chapter: 9,
    title: 'WPA3 seals the payload — for one hop',
    node: 'wififrame',
    mode: 'hw',
    when: { medium: 'wifi' },
    packet: {
      label: '802.11 frame — payload now AES-CCMP encrypted',
      layers: ['wifi', 'ip', 'tcp'],
      fields: {
        wifi: {
          'Addr1 (RA)': 'a4:91:b1:0c:44:e2',
          'Addr2 (TA)': '3c:07:54:6a:2b:91',
          'CCMP header': 'PN=0x00000000482f (replay counter)',
          'Payload': 'AES-CCMP ciphertext (IP+TCP inside)',
          'MIC': '8-byte integrity tag'
        },
        ip: { 'Src': '(encrypted in flight over the air)', 'Dst': '(encrypted)' },
        tcp: { 'Flags': '(encrypted)' }
      }
    },
    explain: {
      what: "Before transmission, the frame body (our entire IP packet) is encrypted with AES-CCMP using the pairwise key (PTK) that was derived when the laptop associated - under WPA3, via the SAE handshake, which is resistant to offline dictionary attacks. A packet number in the CCMP header prevents replays; an 8-byte MIC authenticates the frame. The 802.11 header itself stays in the clear - radios need the addresses to route.",
      why: "Radio is a broadcast medium: anyone in range receives every frame. Link encryption stops neighbors from reading your traffic. Crucially it protects ONE HOP only - the AP decrypts everything. End-to-end privacy is TLS's job, four chapters from now.",
      component: 'WPA3-Personal: SAE key exchange + AES-CCMP per-frame cipher (hostapd/wpa_supplicant)',
      layer: 'Link layer security · OSI L2',
      abstraction: 'An armored van between your house and the post office - not an armored envelope',
      misconception: '"I\'m on WPA3, so my traffic is encrypted" - only across the air gap. The router, your ISP, and every backbone hop see whatever TLS does or does not protect. Wi-Fi encryption and HTTPS solve different problems at different layers.',
      analogy: 'Whispering through a scrambler to the doorman. He unscrambles it and repeats it plainly to everyone down the hall unless the message itself is coded.',
      protocol: 'IEEE 802.11i / WPA3 (SAE, RFC 7664 dragonfly), AES-CCMP-128',
      command: 'wpa_cli status        # key_mgmt=SAE, pairwise_cipher=CCMP\niw dev wlan0 station dump | grep -E "authorized|encrypt"',
      production: 'WPA2-Personal remains everywhere; its 4-way handshake is offline-crackable with a weak passphrase (hashcat mode 22000). WPA3-SAE fixes that. Enterprises sidestep passphrases entirely with 802.1X/EAP per-user credentials.'
    }
  },

  {
    id: 'hw-wifi-csma',
    chapter: 9,
    title: 'CSMA/CA: politely fighting for airtime',
    node: 'nic',
    mode: 'hw',
    when: { medium: 'wifi' },
    effects: ['queue+'],
    explain: {
      what: "The radio cannot just transmit - the 5 GHz channel is shared. It listens until the channel is idle for a DIFS interval, then counts down a random backoff (a slot count drawn from the contention window) while the channel stays clear, and only then fires. And unlike Ethernet, every unicast frame must be answered: the AP sends an ACK after a SIFS gap. No ACK within timeout → assume collision or noise, double the contention window, retry (typically up to 7 times).",
      why: "A radio cannot hear a collision while transmitting (its own signal drowns everything at the antenna), so Ethernet's collision DETECTION is physically impossible - Wi-Fi must do collision AVOIDANCE plus explicit acknowledgment. This machinery is why Wi-Fi latency is inherently jittery.",
      component: '802.11 DCF/EDCA channel access (NIC firmware real-time logic)',
      layer: 'MAC sublayer · OSI L2',
      abstraction: 'Distributed turn-taking with randomized politeness and mandatory "got it!"',
      misconception: '"Wi-Fi packet loss means bad signal" - often it is contention: 30 stations on one channel spend more airtime backing off and retrying than transmitting. The L2 retries also hide loss from TCP as mysterious latency spikes instead.',
      analogy: 'A dinner party with no moderator: wait for silence, count a random pause in your head, speak - and if nobody says "mm-hm", say it again louder.',
      protocol: 'IEEE 802.11 DCF (CSMA/CA), EDCA QoS classes',
      command: 'iw dev wlan0 station dump | grep -E "tx retries|tx failed"\niw dev wlan0 survey dump | grep -A5 "in use"   # channel busy time',
      production: 'Channel utilization ("airtime busy") is THE Wi-Fi health metric - above ~50% busy, latency degrades sharply for everyone. Fixes are spatial (more APs, lower power, band steering), not "more bandwidth".'
    },
    code: [
      { title: 'The transmit ritual', lang: 'c', code: '/* per unicast frame, in firmware: */\n1. carrier sense: channel idle?  (energy + NAV check)\n2. idle for DIFS (34 μs @ 5GHz)\n3. backoff: rand(0..CW) slots × 9 μs, freeze while busy\n4. TRANSMIT frame\n5. wait SIFS (16 μs) → expect ACK from AP\n6. no ACK? CW = min(2×CW, 1023); goto 2  (retry ≤ 7)' }
    ]
  },

  {
    id: 'hw-wifi-radio',
    chapter: 9,
    title: 'OFDM: the SYN rides 5 GHz microwaves',
    node: 'signal',
    mode: 'hw',
    when: { medium: 'wifi' },
    effects: ['flash'],
    packet: {
      label: 'RF burst on channel 36 — SYN encoded in subcarriers',
      layers: ['wifi', 'ip', 'tcp'],
      fields: {
        wifi: { 'Band': '5.18 GHz (channel 36, 80 MHz wide)', 'Modulation': 'OFDM, 996 subcarriers, 256-QAM', 'PHY rate': '~573 Mb/s (HE-MCS 9)', 'Airtime': '~40 μs for this frame' },
        ip: { 'Src': '192.168.1.23', 'Dst': '104.18.32.7' },
        tcp: { 'Flags': 'SYN' }
      }
    },
    explain: {
      what: "The frame is split across ~1000 narrow OFDM subcarriers inside an 80 MHz channel at 5.18 GHz, each subcarrier carrying a few bits as the amplitude-and-phase of a 256-QAM constellation point. The whole encrypted SYN frame occupies the air for tens of microseconds. The AP's radio demodulates, checks the FCS, ACKs, decrypts CCMP - and re-emits our packet as an ordinary wired Ethernet frame toward its internal switch.",
      why: "OFDM divides a hostile wideband channel into many slow, narrow, individually-equalizable channels - the trick that makes hundreds of Mb/s survive multipath reflections off your walls. 2.4 GHz penetrates walls better but is a crowded 3-channel slum; 5 GHz offers many wide, cleaner channels at shorter range.",
      component: '802.11ax PHY (radio DSP + RF front end)',
      layer: 'Physics · OSI L1',
      abstraction: 'A thousand tiny parallel radio stations cooperating to carry one frame',
      misconception: '"5 GHz is faster because higher frequency = faster signal" - propagation speed is identical (c). 5 GHz wins on channel WIDTH and lower congestion; it actually loses on range and wall penetration.',
      analogy: 'Instead of one auctioneer speed-talking (single carrier), a choir of 1000 singers each holding one slow note - the chord is the data.',
      protocol: 'IEEE 802.11ax (Wi-Fi 6): OFDMA, up to 1024-QAM',
      command: 'iw dev wlan0 info                    # channel, width, txpower\niw dev wlan0 scan | grep -E "freq|signal|SSID" | head',
      production: 'Site surveys measure SNR per location: 256-QAM needs ~30 dB SNR; drop below and the radio falls back to lower MCS (slower, more airtime, worse for everyone). Density planning beats power cranking.'
    }
  },

  /* ══════════════ CHAPTER 10 — LAN & NAT ══════════════ */

  {
    id: 'lan-cam-lookup',
    chapter: 10,
    title: 'The switch: CAM table, not broadcast',
    node: 'switch',
    mode: 'net',
    state: { mode: 'net' },
    packet: {
      label: 'SYN frame — switched toward the router port',
      layers: ['eth', 'ip', 'tcp'],
      fields: {
        eth: { 'Src MAC': '3c:07:54:6a:2b:91', 'Dst MAC': 'a4:91:b1:0c:44:e2', 'EtherType': '0x0800' },
        ip: { 'Src': '192.168.1.23', 'Dst': '104.18.32.7', 'TTL': '64' },
        tcp: { 'Src Port': '51324', 'Dst Port': '443', 'Flags': 'SYN' }
      }
    },
    explain: {
      what: "Both media converge here (in a home router the \"switch\" is a chip inside the same box). The switch reads the destination MAC a4:91:b1:0c:44:e2, looks it up in its CAM/FDB table, and forwards the frame out exactly one port - the router's. Simultaneously it LEARNS: src MAC 3c:07:54:6a:2b:91 was seen on port 3, noted for future reverse traffic. Store-and-forward switches also verify the FCS and silently drop corrupt frames.",
      why: "Learning + selective forwarding is what turned shared-medium Ethernet into scalable point-to-point LANs. Only unknown-unicast, broadcast, and multicast frames get flooded to all ports; everything else takes the one correct path at line rate in ASIC hardware.",
      component: 'L2 switching ASIC with CAM (content-addressable memory) forwarding table',
      layer: 'Network gear · OSI L2',
      abstraction: 'A mail sorter who memorizes which desk every name sits at by watching return addresses',
      misconception: '"Switches broadcast everything and NICs filter" - that was a HUB. A switch floods only when it does not yet know the destination port; once learned, traffic is unicast to a single port.',
      analogy: 'A receptionist who never announces over the PA once she knows your office number - and learns numbers by watching who walks out of which door.',
      protocol: 'IEEE 802.1D transparent bridging (learning, flooding, aging)',
      command: 'bridge fdb show br0            # Linux bridge FDB\n# on managed switches: show mac address-table',
      production: 'CAM tables are finite (4-32k entries); attackers can flood random src MACs to overflow them, degrading the switch to hub-like flooding (MAC flooding attack). Port security / max-MAC limits are the standard mitigation.'
    },
    code: [
      { title: 'Forwarding database', lang: 'bash', code: '$ bridge fdb show br0 | grep -v permanent\n3c:07:54:6a:2b:91 dev lan3 master br0        # dev-laptop → port 3\na4:91:b1:0c:44:e2 dev lan1 master br0        # router CPU port\n5c:e9:1e:aa:07:3d dev lan2 master br0        # smart TV\n# entries age out after ~300 s of silence' }
    ]
  },

  {
    id: 'lan-router-ingress',
    chapter: 10,
    title: 'The router accepts the frame — and sheds it',
    node: 'homerouter',
    mode: 'net',
    packet: {
      label: 'SYN — L2 stripped, now an IP packet inside the router',
      layers: ['ip', 'tcp'],
      fields: {
        ip: { 'Src': '192.168.1.23', 'Dst': '104.18.32.7', 'TTL': '64', 'Proto': '6 (TCP)' },
        tcp: { 'Src Port': '51324', 'Dst Port': '443', 'Seq': '1128394821', 'Flags': 'SYN' }
      }
    },
    explain: {
      what: "The router's LAN interface sees dst MAC = its own address, so it accepts the frame instead of ignoring it. The Ethernet header has now done its entire job - delivering the packet ONE hop - and is discarded, FCS and all. What travels up into the router's forwarding path is the bare IP packet. The frame that leaves on the next hop will be a brand new one.",
      why: "This is the moment L2 and L3 scopes visibly separate: MAC addresses are link-local and die at every router; IP addresses are end-to-end and survive the whole journey (NAT's meddling aside). Fifteen routers from now, the IP header will still be recognizably ours.",
      component: 'Router ingress path (NIC MAC filter → ip_rcv() in a Linux-based router)',
      layer: 'Network gear · OSI L2→L3 handoff',
      abstraction: 'Envelopes are hop-scoped; the letter is end-to-end',
      misconception: '"The packet keeps its MAC addresses across the internet" - MACs never leave the local link. Every router hop strips the old L2 header and writes a fresh one for the next link. Wireshark on any backbone would show that link’s MACs, not yours.',
      analogy: 'A relay race: the baton (IP packet) goes the whole distance; each runner (frame) covers exactly one leg and then stops.',
      protocol: 'Ethernet II decapsulation → IPv4 (RFC 791)',
      command: 'ip -br addr show               # the router’s own addresses\ntcpdump -ni br-lan -c1 -e tcp port 443   # see L2 header at the last moment',
      production: 'Home routers punt most traffic to hardware NAT/flow engines; only first-packets and exceptions hit the CPU. When "hardware offload" has bugs (common in cheap firmware), disabling it in OpenWrt drops throughput but fixes weird stalls.'
    }
  },

  {
    id: 'lan-route-decision',
    chapter: 10,
    title: 'Longest-prefix match: everything unknown goes to the ISP',
    node: 'homerouter',
    mode: 'net',
    quiz: {
      q: 'Where does the router send a packet destined for 104.18.32.7?',
      options: ['To the DNS server that resolved the name', 'Out the WAN port toward the ISP (default route)', 'It floods it to all LAN ports like a switch'],
      answer: 1,
      explain: 'Routing is longest-prefix match over the FIB. 104.18.32.7 matches neither 192.168.1.0/24 nor any other specific route - only 0.0.0.0/0, the default route via the WAN interface. DNS was consulted long ago and is irrelevant to forwarding.'
    },
    explain: {
      what: "The router runs its FIB lookup on 104.18.32.7: it is not in 192.168.1.0/24 (directly connected LAN), matches no other prefix - so it falls through to 0.0.0.0/0, the default route pointing out the WAN interface toward the ISP's gateway. Longest prefix wins: a /24 would beat the /0 if one matched, but nothing does. Decision: forward via WAN.",
      why: "The whole internet works because routers do not need to know everywhere - they only need SOME matching prefix, with a default as the catch-all. A home router knows 2-3 routes; a backbone router knows ~1 million. Same algorithm, different table size.",
      component: 'FIB / routing table lookup (Linux: fib_lookup(), LPM trie)',
      layer: 'Network gear · OSI L3',
      abstraction: 'A decision tree where the most specific rule that matches wins',
      misconception: '"The router asks DNS or some central authority where to send packets" - forwarding is a pure local table lookup, microseconds, no queries. How the TABLE gets populated (statics, DHCP, BGP) is a separate, slower plane.',
      analogy: 'Office mail sorting: "4th floor" bins for known departments, and one big bin labeled "everything else → main post office".',
      protocol: 'IPv4 forwarding, longest-prefix match (RFC 1812)',
      command: 'ip route show\nip route get 104.18.32.7      # ask the kernel to explain its decision',
      production: 'ip route get is the first command in any "why is traffic going the wrong way" incident - it shows exactly which route, source address, and interface the kernel selects for a destination.'
    },
    code: [
      { title: 'The router’s entire worldview', lang: 'bash', code: '$ ip route show\ndefault via 100.64.17.1 dev wan  proto dhcp  src 203.0.113.77\n100.64.17.0/24 dev wan   proto kernel  scope link\n192.168.1.0/24 dev br-lan proto kernel  scope link  src 192.168.1.1\n\n$ ip route get 104.18.32.7\n104.18.32.7 via 100.64.17.1 dev wan src 203.0.113.77' }
    ]
  },

  {
    id: 'lan-ttl-decrement',
    chapter: 10,
    title: 'TTL 64 → 63: the hop counter ticks',
    node: 'homerouter',
    mode: 'net',
    packet: {
      label: 'SYN — first router hop consumed',
      layers: ['ip', 'tcp'],
      fields: {
        ip: { 'Src': '192.168.1.23', 'Dst': '104.18.32.7', 'TTL': '63 (was 64)', 'Header checksum': 'incrementally patched' },
        tcp: { 'Src Port': '51324', 'Dst Port': '443', 'Flags': 'SYN' }
      }
    },
    explain: {
      what: "As part of forwarding, the router decrements the IP TTL from 64 to 63 and patches the header checksum incrementally (RFC 1624 - no need to re-sum the whole header for a one-field change). Had TTL hit 0, the packet would be dropped and an ICMP Time Exceeded sent back to 192.168.1.23 - which is precisely the mechanism traceroute weaponizes with deliberately tiny TTLs.",
      why: "TTL is the internet's loop insurance: a routing loop would otherwise circulate packets forever, melting links. A finite hop budget guarantees every packet eventually dies somewhere. As a bonus, received-TTL is a forensic clue to how many hops a packet traveled.",
      component: 'IP forwarding path (ip_forward() → ip_decrease_ttl())',
      layer: 'Network gear · OSI L3',
      abstraction: 'A bus ticket with 64 punch holes - one punched per transfer',
      misconception: '"TTL is a time value in seconds" - RFC 791 said seconds, but reality standardized on hops decades ago. Nothing measures wall time; each router just subtracts one.',
      analogy: 'A chain letter that must be discarded after 64 forwards - guaranteeing even a mis-addressed one cannot circulate forever.',
      protocol: 'IPv4 TTL (RFC 791 §3.2, RFC 1812); ICMP Time Exceeded (RFC 792)',
      command: 'traceroute -n 104.18.32.7      # TTL=1,2,3... harvests each hop’s ICMP\nping -t 1 104.18.32.7          # die at the first router, on purpose',
      production: 'Received TTL near 64/128/255 minus small n reveals hop distance and sender OS defaults (Linux 64, Windows 128). Sudden TTL changes on monitored flows are a classic symptom of route changes or traffic interception.'
    }
  },

  {
    id: 'lan-nat-before',
    chapter: 10,
    title: 'At the NAT boundary: a private address that cannot leave',
    node: 'nat',
    mode: 'net',
    packet: {
      label: 'SYN — BEFORE NAT rewrite',
      layers: ['ip', 'tcp'],
      fields: {
        ip: { 'Src': '192.168.1.23  ← RFC1918, unroutable', 'Dst': '104.18.32.7', 'TTL': '63' },
        tcp: { 'Src Port': '51324', 'Dst Port': '443', 'Seq': '1128394821', 'Flags': 'SYN' }
      }
    },
    explain: {
      what: "The packet reaches the netfilter POSTROUTING hook still bearing src 192.168.1.23:51324. That source is a death sentence on the public internet: 192.168.0.0/16 is RFC 1918 private space, and no backbone router will carry a reply toward it - millions of homes use the same numbers. Conntrack has already logged the flow's original tuple: (192.168.1.23, 51324) → (104.18.32.7, 443), TCP, state NEW.",
      why: "IPv4 has 3.7 billion usable addresses for ~20 billion devices. NAT is the pressure valve: entire households share one public IP. The conntrack entry created here is the memory that will make the reply translatable in reverse.",
      component: 'netfilter conntrack + nat table, POSTROUTING chain',
      layer: 'Router kernel · OSI L3/L4',
      abstraction: 'An outbound border checkpoint that must issue you public papers before you exit',
      misconception: '"NAT is a security firewall" - dropping unsolicited inbound is a side effect of having no mapping, not filtering policy. Real firewalling is separate rules; NAT’s job is address translation, and its side effect breaks P2P (hence STUN/TURN).',
      analogy: 'Your internal desk extension (x51324) cannot receive calls from outside the company; the switchboard must assign an outside line first.',
      protocol: 'RFC 1918 private addressing; NAPT (RFC 2663/3022)',
      command: 'conntrack -L -p tcp --dport 443 | head\nnft list table nat        # or: iptables -t nat -L POSTROUTING -v',
      production: 'Conntrack tables are finite (net.netfilter.nf_conntrack_max). When full, NEW connections are dropped with the infamous "nf_conntrack: table full, dropping packet" - a classic outage on busy gateways and misconfigured k8s nodes.'
    },
    code: [
      { title: 'The masquerade rule waiting to fire', lang: 'bash', code: '$ nft list chain nat postrouting\ntable ip nat {\n    chain postrouting {\n        type nat hook postrouting priority srcnat;\n        oifname "wan" masquerade    # ← rewrite src to WAN IP\n    }\n}' }
    ]
  },

  {
    id: 'lan-nat-rewrite',
    chapter: 10,
    title: 'PAT: 192.168.1.23:51324 becomes 203.0.113.77:38112',
    node: 'nat',
    mode: 'net',
    effects: ['flash'],
    packet: {
      label: 'SYN — AFTER NAT rewrite',
      layers: ['ip', 'tcp'],
      fields: {
        ip: { 'Src': '203.0.113.77  ← rewritten (WAN IP)', 'Dst': '104.18.32.7', 'TTL': '63', 'Checksum': 'incrementally fixed' },
        tcp: { 'Src Port': '38112  ← rewritten', 'Dst Port': '443', 'Seq': '1128394821 (unchanged)', 'Checksum': 'fixed (pseudo-header changed)' }
      }
    },
    explain: {
      what: "The masquerade rule fires: source IP is rewritten to the WAN address 203.0.113.77, and the source port to 38112 - a free port chosen so this flow stays unique among every device in the house. Both the IP and TCP checksums are patched incrementally (the TCP checksum covers a pseudo-header containing the IP addresses, so it MUST change too). Conntrack stores the bidirectional mapping: replies to 203.0.113.77:38112 will be rewritten back to 192.168.1.23:51324.",
      why: "Port translation (PAT/NAPT) is what lets one public IP serve a whole LAN: the 16-bit port space gives ~64k concurrent flows. The 5-tuple after rewrite is globally unambiguous; the conntrack entry is the only place in the universe that remembers who 38112 really is.",
      component: 'netfilter NAT engine (nf_nat_ipv4_manip_pkt) + conntrack tuple store',
      layer: 'Router kernel · OSI L3/L4',
      abstraction: 'A stateful pseudonym service: every outgoing flow gets an alias, and the ledger maps replies back',
      misconception: '"NAT only changes the IP address" - for shared-IP NAT it must also manage PORTS, or two devices using the same source port would collide. And it must fix TWO checksums; naive middleboxes that forget the TCP pseudo-header produce mysteriously dropped packets.',
      analogy: 'A hotel concierge mailing guests’ letters with the hotel’s return address plus a room-tracking code, keeping a ledger to route replies to the right room.',
      protocol: 'NAPT (RFC 3022); checksum update per RFC 1624',
      command: 'conntrack -L | grep 38112\ncat /proc/sys/net/netfilter/nf_conntrack_tcp_timeout_established',
      production: 'CGNAT at ISPs does this a second time at carrier scale - port exhaustion per subscriber is real, and logging port mappings is a legal requirement in many jurisdictions. At home, "full cone" vs "symmetric" NAT behavior decides whether your video calls need TURN relays.'
    },
    code: [
      { title: 'The ledger entry', lang: 'bash', code: '$ conntrack -L -p tcp | grep 38112\ntcp  6 118 SYN_SENT\n  src=192.168.1.23 dst=104.18.32.7 sport=51324 dport=443\n  [UNREPLIED]\n  src=104.18.32.7 dst=203.0.113.77 sport=443 dport=38112\n  mark=0 use=1\n# line 2 is the ORIGINAL tuple, line 4 the expected REPLY tuple' }
    ]
  },

  {
    id: 'lan-modem-upstream',
    chapter: 10,
    title: 'The modem begs for airtime, then modulates',
    node: 'modem',
    mode: 'net',
    packet: {
      label: 'SYN — modulated onto coax toward the CMTS',
      layers: ['ip', 'tcp'],
      fields: {
        ip: { 'Src': '203.0.113.77', 'Dst': '104.18.32.7', 'TTL': '63' },
        tcp: { 'Src Port': '38112', 'Dst Port': '443', 'Flags': 'SYN' }
      }
    },
    explain: {
      what: "The cable modem cannot simply transmit: DOCSIS upstream is shared among the whole neighborhood segment. It sends a bandwidth REQUEST; the CMTS scheduler answers in a MAP message granting specific minislots; only then does the modem burst our frame upstream as OFDMA symbols on its assigned subcarriers. (On fiber, the GPON ONT does the moral equivalent: TDMA bursts at 1310 nm in windows assigned by the OLT.) This request-grant dance costs 1-5 ms.",
      why: "Hundreds of homes share the upstream spectrum; without a central scheduler their bursts would collide. This is also why home uplinks feel worse than downlinks: every upstream packet - including bare TCP ACKs - waits for a grant.",
      component: 'DOCSIS 3.1 cable modem + CMTS scheduler (or GPON ONT + OLT)',
      layer: 'Access network · OSI L1/L2',
      abstraction: 'Raising your hand and waiting to be called on before every sentence',
      misconception: '"My 20 Mb/s uplink means my packets leave instantly" - bandwidth is rate, not access latency. The grant cycle adds milliseconds of jitter per upstream burst, which is why bufferbloat plus DOCSIS makes video calls stutter while downloads look fine.',
      analogy: 'A classroom where the teacher (CMTS) holds the only talking stick and schedules who may speak in which two-second window.',
      protocol: 'DOCSIS 3.1 (request/grant MAPs, OFDMA upstream) / ITU-T G.984 GPON',
      command: '# modem diagnostics (typically http://192.168.100.1)\n# SNR, upstream power, T3/T4 timeouts\nping -c 20 100.64.17.1   # first-hop jitter reveals grant latency',
      production: 'ISPs watch upstream SNR and T3/T4 timeout counters per modem; degrading coax (water in a tap!) shows as rising codeword errors. Latency-focused DOCSIS features (Low Latency DOCSIS) exist precisely because of grant-cycle jitter.'
    }
  },

  /* ══════════════ CHAPTER 11 — ISP & BACKBONE ══════════════ */

  {
    id: 'isp-headend',
    chapter: 11,
    title: 'The headend: where the neighborhood becomes the internet',
    node: 'headend',
    mode: 'net',
    packet: {
      label: 'SYN — back on professional-grade Ethernet/IP',
      layers: ['ip', 'tcp'],
      fields: {
        ip: { 'Src': '203.0.113.77', 'Dst': '104.18.32.7', 'TTL': '63' },
        tcp: { 'Src Port': '38112', 'Dst Port': '443', 'Flags': 'SYN' }
      }
    },
    explain: {
      what: "At the ISP headend the CMTS (Cable Modem Termination System) demodulates the OFDMA burst, reassembles the DOCSIS frames, and our packet sheds its access-network costume - it is an ordinary IP packet on 100G Ethernet again. One CMTS serves a service group of hundreds of homes; from here on, everything is carrier-grade: redundant routers, fiber links, real routing protocols.",
      why: "Access networks (DOCSIS, GPON, DSL) are specialized last-mile technologies for hostile, cheap media. The headend is the border where consumer physics ends and the backbone's clean fiber world begins.",
      component: 'CMTS / OLT at the ISP headend or central office',
      layer: 'ISP access edge · OSI L1-L3',
      abstraction: 'The on-ramp where a gravel driveway meets the highway system',
      misconception: '"My ISP is one big router" - between your modem and the internet sit an access-termination layer (CMTS/OLT), aggregation rings, a metro core, and border routers, each with distinct failure modes. "The ISP is down" is usually ONE of these layers.',
      analogy: 'The neighborhood mail truck emptying into the regional sorting center - same letters, industrial machinery from here on.',
      protocol: 'DOCSIS 3.1 termination → Ethernet/IP; often PPPoE/IPoE session termination nearby',
      command: 'traceroute -n 104.18.32.7 | head -4\n# hop 2-3 = ISP aggregation, often with DNS names like\n# cmts-01.ams.example-isp.net',
      production: 'CMTS service groups are capacity-planned per neighborhood; oversubscription shows as evening throughput dips. ISPs monitor per-service-group utilization and split node segments when p95 saturates.'
    }
  },

  {
    id: 'isp-core-agg',
    chapter: 11,
    title: 'Aggregation and the ISP core',
    node: 'ispcore',
    mode: 'net',
    packet: {
      label: 'SYN — TTL 62, riding the metro core',
      layers: ['ip', 'tcp'],
      fields: {
        ip: { 'Src': '203.0.113.77', 'Dst': '104.18.32.7', 'TTL': '62 (ISP router hop)' },
        tcp: { 'Src Port': '38112', 'Dst Port': '443', 'Flags': 'SYN' }
      }
    },
    explain: {
      what: "The first true ISP router hop: a BNG/aggregation router validates the subscriber session, applies any shaping policy, decrements TTL to 62, and forwards into the metro core - often pushing an MPLS label so core routers switch on labels instead of doing full IP lookups. Our packet is now multiplexed with tens of thousands of other subscribers' flows on shared 100G/400G links.",
      why: "Aggregation is the ISP's business model made physical: thousands of 1 Gb/s subscribers share a few hundred-gig core links, betting (statistically, correctly) that they never all burst at once.",
      component: 'BNG / aggregation + core routers (MPLS label-switched paths)',
      layer: 'ISP core · OSI L3 (L2.5 with MPLS)',
      abstraction: 'Tributaries merging into a river - individual drops indistinguishable, flow conserved',
      misconception: '"Each connection gets its own path through the ISP" - flows share fat pipes and only headers distinguish them. QoS/shaping, where applied, happens at the subscriber edge, not per-flow in the core.',
      analogy: 'Neighborhood streets feeding a motorway: your car keeps its identity (plates = headers) but shares lanes with everyone.',
      protocol: 'IP over MPLS (RFC 3031); PPPoE/IPoE subscriber management at the BNG',
      command: 'mtr -n --report -c 20 104.18.32.7\n# per-hop loss/latency; ISP core hops are the 10.x or CGNAT-range ones',
      production: 'Core links are run at <50% so a single failure cannot congest the survivor (N+1). Netflow/sFlow sampling here feeds capacity planning and DDoS detection.'
    }
  },

  {
    id: 'isp-bgp-lookup',
    chapter: 11,
    title: 'BGP: choosing a road to AS13335',
    node: 'bgp',
    mode: 'net',
    explain: {
      what: "At the ISP border router, the FIB entry for 104.18.32.7 was installed by BGP. The RIB holds several candidate routes to Cloudflare's prefix 104.18.32.0/20 (AS13335): via transit provider A, via transit B, via direct peering. Best-path selection ran long ago: highest local-preference wins first (peering is free, so it is preferred over paid transit), then shortest AS-path, then MED, then IGP cost. Winner here: the settlement-free peering path, AS-path just \"13335\".",
      why: "BGP is the internet's routing AND economics protocol - local-pref encodes business contracts, not distance. And because Cloudflare announces this same prefix from hundreds of cities (anycast), \"best path to 104.18.32.7\" quietly means \"path to the NEAREST Cloudflare front door\".",
      component: 'BGP border router (FRR/IOS-XR/Junos), RIB → FIB installation',
      layer: 'Inter-domain routing · OSI L3 control plane',
      abstraction: 'A map drawn by 80,000 competing companies, each advertising only the roads it profits from',
      misconception: '"The internet routes by shortest distance" - BGP has no notion of latency or geography. It optimizes policy: money first (local-pref), then AS-hop count. A packet can take a measurably slower path because it is cheaper.',
      analogy: 'Choosing a shipping carrier not by map distance but by which one you have a contract with - and only then by number of transfers.',
      protocol: 'BGP-4 (RFC 4271); Cloudflare = AS13335',
      command: "# public looking glass or local FRR:\nvtysh -c 'show bgp ipv4 unicast 104.18.32.7'\nwhois -h whois.radb.net 104.18.32.7 | grep origin",
      production: 'Route leaks and hijacks are the systemic risk: RPKI origin validation (drop invalids) is the modern baseline. NOCs watch BGP feeds (bgpstream) for their prefixes announced by strangers.'
    },
    code: [
      { title: 'Best-path selection', lang: 'bash', code: "$ vtysh -c 'show bgp ipv4 unicast 104.18.32.7'\nBGP routing table entry for 104.18.32.0/20\nPaths: (3 available, best #2)\n  3356 13335        # via transit (Lumen)   local-pref 100\n  13335             # via peering  ← BEST   local-pref 200\n  1299 13335        # via transit (Arelion) local-pref 100\n      Origin IGP, valid, external, best (Local Pref)\n# RPKI: prefix 104.18.32.0/20 origin AS13335 = VALID" }
    ]
  },

  {
    id: 'isp-fiber-longhaul',
    chapter: 11,
    title: 'Long-haul fiber: the SYN becomes light',
    node: 'fiber',
    mode: 'net',
    packet: {
      label: 'SYN — 1550 nm photons in a glass core 9 μm wide',
      layers: ['ip', 'tcp'],
      fields: {
        ip: { 'Src': '203.0.113.77', 'Dst': '104.18.32.7', 'TTL': '62' },
        tcp: { 'Src Port': '38112', 'Dst Port': '443', 'Flags': 'SYN' }
      }
    },
    explain: {
      what: "Between cities, the packet rides as light pulses at 1550 nm in a single-mode fiber core thinner than a hair. DWDM packs ~96 wavelengths onto one strand, each carrying 100-400 Gb/s via coherent modulation (phase + amplitude + polarization) - tens of terabits per fiber pair. EDFA amplifiers boost the analog light every ~80-100 km without ever decoding it. Speed in glass: c/1.468 ≈ 204,000 km/s - about 4.9 μs per km.",
      why: "That 4.9 μs/km is the tyrant of every latency budget: Amsterdam-Frankfurt (~400 km of routed fiber) costs ~2 ms one-way before a single queue. No protocol tuning beats geography - this is the physics that justifies CDNs and anycast.",
      component: 'DWDM line systems, coherent transponders, EDFA amplifier huts',
      layer: 'Optical transport · OSI L1',
      abstraction: 'A hundred colored rivers of data in one glass thread',
      misconception: '"Fiber is faster than copper because light beats electrons" - propagation speed is nearly identical (~0.66c vs ~0.68c). Fiber wins on attenuation (100 km vs 100 m spans) and bandwidth (THz of usable spectrum), not velocity.',
      analogy: 'A prism in reverse: 96 distinct colors merged into one beam, traveling together, split apart again at the far end.',
      protocol: 'DWDM (ITU-T G.694.1 grid), coherent DP-16QAM optics',
      command: 'ping -c5 104.18.32.7   # ~24 ms RTT: mostly fiber km, not router time\n# 24 ms RTT ≈ up to ~2400 km of glass round trip',
      production: 'Submarine cables and long-haul routes are why multi-region architectures exist. Ops teams memorize the constant: ~1 ms RTT per 100 km of fiber. Backhoe fades (literal digging accidents) remain the top cause of long-haul outages.'
    },
    code: [
      { title: 'Latency budget so far', lang: 'bash', code: '# one-way budget for our SYN (typical cable-ISP suburb → AMS PoP)\nlaptop → router        ~0.3 ms   (LAN + router CPU)\nDOCSIS grant + coax    ~2.0 ms   (request/grant cycle)\nISP metro + core       ~3.0 ms   (queues + 300 km fiber)\npeering + CF edge      ~6.0 ms   (long-haul fiber dominates)\n                       ------\n                      ~11 ms one-way  → ~22-24 ms RTT' }
    ]
  },

  {
    id: 'isp-tier1a',
    chapter: 11,
    title: 'Backbone hop: forwarding at terabit scale',
    node: 'tier1a',
    mode: 'net',
    packet: {
      label: 'SYN — TTL 62 → 61 at the backbone router',
      layers: ['ip', 'tcp'],
      fields: {
        ip: { 'Src': '203.0.113.77', 'Dst': '104.18.32.7', 'TTL': '61' },
        tcp: { 'Src Port': '38112', 'Dst Port': '443', 'Flags': 'SYN' }
      }
    },
    explain: {
      what: "A backbone router - a chassis the size of a fridge pushing tens of Tb/s - receives the packet, and its forwarding ASIC does the FIB lookup in nanoseconds against ~1M routes held in TCAM/specialized memory. TTL becomes 61. Total time in the box when queues are empty: single-digit microseconds. The control plane (BGP, on a general-purpose CPU) is nowhere in the fast path.",
      why: "The separation of control plane (compute routes, milliseconds-to-minutes) from data plane (forward packets, nanoseconds) is THE architectural idea of modern routers. Software decides; silicon repeats that decision billions of times per second.",
      component: 'Carrier router line cards (Broadcom Jericho / Cisco Silicon One class ASICs)',
      layer: 'Internet backbone · OSI L3',
      abstraction: 'A decision made once, stamped into hardware, executed blindly at line rate',
      misconception: '"Routers examine each packet in software" - backbone forwarding never touches a CPU. Only exceptions (TTL expiry, options, control traffic) get punted to the processor, which is why crafted exception-path floods can hurt routers whose forwarding is fine.',
      analogy: 'A tollbooth where the pricing committee (BGP) meets monthly, but the gate arm (ASIC) lifts 10 million times a day without asking anyone.',
      protocol: 'IPv4 forwarding at line rate; interfaces 100/400GE (IEEE 802.3ck)',
      command: 'traceroute -n 104.18.32.7\n# backbone hops show as *.telia.net / *.lumen.tech etc.\n# RTT jumps of 5-10 ms between hops = long-haul fiber spans',
      production: 'Backbone SLAs live on p99 per-link latency and drops; interface microbursts invisible to 1-min averages are caught with high-resolution counters. Drain-before-maintenance (costing out a link in IGP/BGP) is standard change practice.'
    }
  },

  {
    id: 'isp-ixp',
    chapter: 11,
    title: 'The IXP: a giant switch where networks shake hands',
    node: 'ixp',
    mode: 'net',
    explain: {
      what: "The packet crosses an Internet Exchange Point - physically, a monstrous L2 switching fabric in a colo facility where hundreds of networks each plug in a router port and peer over a shared subnet. Our ISP's border router forwards straight to Cloudflare's router across the fabric; the IXP itself is transparent at L3 (no TTL decrement - it is a switch, not a router). Route servers let members exchange BGP routes many-to-many without n² sessions.",
      why: "IXPs exist for economics and latency: peering across a fabric is settlement-free and one switch-hop away, versus paying a transit provider to carry the same bits the long way around. The big ones (AMS-IX, DE-CIX, LINX) move tens of Tb/s at peak.",
      component: 'IXP peering fabric + route servers (e.g. BIRD at major IXPs)',
      layer: 'Inter-network exchange · OSI L2 fabric, L3 peering',
      abstraction: 'A farmers market for packets: every network rents a stall and trades directly',
      misconception: '"The internet backbone is owned by someone" - there is no backbone entity, just thousands of bilateral and multilateral agreements made concrete in rooms like this. The "internet" is precisely this mesh of handshakes.',
      analogy: 'Instead of every airline flying you via their own hub (transit), all airlines agree to meet at one airport where you change planes directly (peering).',
      protocol: 'Ethernet fabric + BGP sessions across a shared /21-ish peering LAN',
      command: '# see who peers where (public data):\ncurl -s https://www.peeringdb.com/api/net?asn=13335 | head\n# traceroute clue: hop names like *.ams-ix.net',
      production: 'Peering disputes are real outages: when networks de-peer, traffic shifts to congested transit and users feel it. Content networks like Cloudflare peer as widely as possible (open peering policy) exactly to shorten paths.'
    }
  },

  {
    id: 'isp-tier1b',
    chapter: 11,
    title: 'Last carrier hop — entering Cloudflare’s network',
    node: 'tier1b',
    mode: 'net',
    packet: {
      label: 'SYN — TTL 60, one hop from the edge',
      layers: ['ip', 'tcp'],
      fields: {
        ip: { 'Src': '203.0.113.77', 'Dst': '104.18.32.7', 'TTL': '60' },
        tcp: { 'Src Port': '38112', 'Dst Port': '443', 'Flags': 'SYN' }
      }
    },
    explain: {
      what: "One more L3 hop (TTL → 60) and the packet crosses an administrative frontier: it leaves the ISP/carrier world and enters AS13335 - Cloudflare's own network. Border filters apply (uRPF, bogon drops, DDoS scrubbing steering), then it is inside the destination autonomous system, five hops and ~11 ms after leaving the laptop.",
      why: "AS boundaries are the internet's real borders - each Autonomous System is a sovereign routing domain with its own policy. Everything up to here was 'somebody else carrying our packet'; from here, the destination network controls its fate entirely.",
      component: 'Cloudflare edge border router (AS13335 ingress)',
      layer: 'Inter-domain boundary · OSI L3',
      abstraction: 'Crossing from international waters into the destination country’s port authority',
      misconception: '"Packets take the same path back" - routing is unidirectional; the reply will follow whatever path CF’s BGP prefers toward the ISP, frequently asymmetric. Traceroute shows YOUR path only; the reverse can differ wildly.',
      analogy: 'A parcel handed from the last freight carrier to the recipient company’s own internal mailroom network.',
      protocol: 'BGP AS boundary; ingress filtering (BCP 38/uRPF)',
      command: 'traceroute -n 104.18.32.7 | tail -3\n#  ...\n#  8  141.101.71.63   (cloudflare peering)\n#  9  104.18.32.7     ← inside AS13335',
      production: 'Edge providers apply ACLs and flow-based DDoS detection at ingress; volumetric attacks are dropped here, at the border, before touching servers. BCP 38 (drop spoofed sources) at every AS edge is the internet’s herd immunity - incompletely adopted.'
    }
  },

  {
    id: 'isp-anycast-arrive',
    chapter: 11,
    title: 'Anycast: 104.18.32.7 is hundreds of places at once',
    node: 'anycast',
    mode: 'remote',
    state: { mode: 'remote' },
    packet: {
      label: 'SYN — arrived at the nearest Cloudflare PoP',
      layers: ['ip', 'tcp'],
      fields: {
        ip: { 'Src': '203.0.113.77', 'Dst': '104.18.32.7', 'TTL': '60' },
        tcp: { 'Src Port': '38112', 'Dst Port': '443', 'Seq': '1128394821', 'Flags': 'SYN' }
      }
    },
    explain: {
      what: "The packet lands in a Cloudflare Point of Presence - say Amsterdam. Here is the trick: 104.18.32.7 is not one machine. Cloudflare announces 104.18.32.0/20 via BGP from 300+ cities simultaneously (anycast); the internet's routing gravity naturally pulled our packet to the topologically nearest PoP. A user in Tokyo sending to the same IP lands in Tokyo. Inside the PoP, ECMP hashes the 4-tuple to one specific edge metal, consistently.",
      why: "Anycast gives global load distribution and DDoS dilution with zero client logic: attacks spread across hundreds of sites instead of concentrating, and every user gets a nearby front door. DNS (1.1.1.1, most root servers) runs on the same trick.",
      component: 'Cloudflare anycast edge (BGP-announced prefix from every PoP)',
      layer: 'Global routing architecture · OSI L3',
      abstraction: 'One phone number that always rings the nearest office',
      misconception: '"An IP address identifies one machine" - anycast breaks that cleanly: identical prefix, hundreds of locations, and BGP picks per-sender. It works for TCP because routing is stable on RTT timescales, and per-PoP ECMP keeps a flow pinned to one server.',
      analogy: 'Every 112/911 call reaches "the" emergency number, yet always a LOCAL dispatch center answers.',
      protocol: 'BGP anycast (RFC 4786 operational practice)',
      command: 'curl -s https://api.shop.dev/cdn-cgi/trace   # colo=AMS reveals your PoP\nmtr -n --report 104.18.32.7   # compare from a VPS on another continent',
      production: 'Anycast catchment is managed by shaping BGP announcements per region (prepending, communities, selective announce). A PoP overload is drained by withdrawing announcements - traffic reflows to neighbors in seconds, invisibly to users.'
    }
  },

  /* ══════════════ CHAPTER 12 — TCP HANDSHAKE ══════════════ */

  {
    id: 'tcp-syn-at-edge',
    chapter: 12,
    title: 'The SYN reaches a listening socket — 11 ms after birth',
    node: 'anycast',
    mode: 'remote',
    packet: {
      label: 'SYN — delivered to the edge TCP stack',
      layers: ['ip', 'tcp'],
      fields: {
        ip: { 'Src': '203.0.113.77', 'Dst': '104.18.32.7', 'TTL': '60' },
        tcp: { 'Src Port': '38112', 'Dst Port': '443', 'Seq': '1128394821', 'Flags': 'SYN', 'Options': 'MSS 1460, SACK-OK, WS 7, TS' }
      }
    },
    explain: {
      what: "On the chosen edge server, the kernel's tcp_v4_rcv() finds a listening socket on 443 and parses the SYN: initial seq 1128394821, and the client's opening offer - MSS 1460, SACK permitted, window scale 7, timestamps. To this server the client IS 203.0.113.77:38112; the NAT'd tuple is the only identity that exists out here. 192.168.1.23 was never on the wire past the home router.",
      why: "The SYN is a capability negotiation, not just a hello: both sides must agree on segment size and modern extensions (SACK, window scaling - without which TCP caps at 64 KB in flight) before a single payload byte.",
      component: 'Edge server TCP stack (net/ipv4/tcp_ipv4.c: tcp_v4_rcv → listening socket)',
      layer: 'Remote server kernel · OSI L4',
      abstraction: 'A formal opening bid listing the dialect features you can speak',
      misconception: '"The server sees my private IP somewhere in the packet" - it does not exist in any header. Only the conntrack table at your home router remembers it; the server would need you to leak it at the application layer.',
      analogy: 'A letter arriving with only the hotel’s address - the front desk ledger (NAT) is the sole map back to your room.',
      protocol: 'TCP (RFC 9293) connection establishment',
      command: 'ss -ltn sport = :443     # the listening socket, with backlog\nnstat -az TcpExtListenDrops   # SYNs dropped due to full queues',
      production: 'Edges terminate TCP close to users on purpose: a 24 ms handshake RTT instead of 140 ms to origin. This "TCP proximity" is a large share of a CDN’s perceived speedup even for uncacheable traffic.'
    }
  },

  {
    id: 'tcp-syn-queue',
    chapter: 12,
    title: 'SYN queue and syncookies: remembering half-open guests',
    node: 'anycast',
    mode: 'remote',
    explain: {
      what: "Normally the kernel stores a mini connection record (a request_sock in the SYN queue, state SYN_RECV) until the client's final ACK arrives, then promotes it to the accept queue. But that memory is attackable: a SYN flood fills the queue with fake half-opens. Under pressure, Linux switches to syncookies - it encodes the essential state (rough MSS, timestamp) cryptographically INTO the SYN-ACK's sequence number and stores nothing; a valid final ACK proves the client is real and reconstitutes the state.",
      why: "SYN floods were the original volumetric DoS (1996). Syncookies convert a memory-exhaustion attack into mere bandwidth noise - stateless until the peer proves liveness. At Cloudflare's scale, absorbing SYN floods for customers is a headline product feature.",
      component: 'SYN/accept queues (net/ipv4/tcp_input.c, tcp_syncookies)',
      layer: 'Remote server kernel · OSI L4',
      abstraction: 'Instead of writing down every caller, hand each a signed claim ticket and keep no list',
      misconception: '"The backlog argument to listen() is how many connections can exist" - it caps the ACCEPT queue (fully established, waiting for accept()); the SYN queue is separate. Full accept queues silently drop handshake-completing ACKs - a notorious cause of mystery timeouts on overloaded services.',
      analogy: 'A nightclub that stops keeping a guest list during a rush and instead stamps hands with a forgery-proof stamp.',
      protocol: 'TCP syncookies (Bernstein/Eastlake; RFC 4987 covers SYN flood defenses)',
      command: 'sysctl net.ipv4.tcp_syncookies          # =1 (on under pressure)\nsysctl net.ipv4.tcp_max_syn_backlog\nnstat -az TcpExtSyncookiesSent TcpExtListenOverflows',
      production: 'ListenOverflows/ListenDrops climbing = accept() too slow or backlog too small: fix the app’s accept loop or raise somaxconn + listen backlog. Syncookies engaging constantly (not just under attack) signals chronic overload.'
    },
    code: [
      { title: 'Server-side queues', lang: 'bash', code: '$ ss -ltn sport = :443\nState   Recv-Q  Send-Q  Local Address:Port\nLISTEN  0       4096    0.0.0.0:443\n# Recv-Q = current accept-queue depth, Send-Q = backlog cap\n\n$ nstat -az | grep -E "SyncookiesSent|ListenDrops"\nTcpExtSyncookiesSent    182437\nTcpExtListenDrops       0' }
    ]
  },

  {
    id: 'tcp-synack-build',
    chapter: 12,
    title: 'SYN-ACK: the server answers with its own opening bid',
    node: 'anycast',
    mode: 'remote',
    packet: {
      label: 'SYN-ACK seq=3892217345 ack=1128394822',
      layers: ['ip', 'tcp'],
      fields: {
        ip: { 'Src': '104.18.32.7', 'Dst': '203.0.113.77', 'TTL': '64 (fresh)', 'Proto': '6 (TCP)' },
        tcp: { 'Src Port': '443', 'Dst Port': '38112', 'Seq': '3892217345 (server ISN)', 'Ack': '1128394822', 'Flags': 'SYN, ACK', 'Options': 'MSS 1460, SACK-OK, WS 10, TS' }
      }
    },
    quiz: {
      q: 'The SYN-ACK carries ack=1128394822. What exactly does that number promise?',
      options: [
        'The server received 1,128,394,822 bytes so far',
        '"I received your SYN (seq 1128394821) and expect your next byte numbered 1128394822"',
        'It is the server’s own randomly chosen sequence number'
      ],
      answer: 1,
      explain: 'ACK numbers are cumulative: "next byte I expect". The SYN consumes one sequence number despite carrying no data, so acknowledging it means client-ISN + 1 = 1128394822. The server’s own random ISN (3892217345) rides in the Seq field.'
    },
    explain: {
      what: "The server builds its reply with both flags set: SYN (here is MY random initial sequence number, 3892217345 - independently chosen, RFC 6528-style hashed to prevent prediction) and ACK 1128394822 (your SYN is received; it consumed one sequence number). It attaches its own options: MSS 1460, SACK permitted, window scale 10. Two of the three handshake legs now exist.",
      why: "Both directions of a TCP connection are independent byte streams, so each side must pick and announce its own ISN. Random ISNs also defeat off-path attackers from blindly injecting data into connections they cannot see.",
      component: 'Server TCP output (tcp_v4_send_synack → tcp_make_synack)',
      layer: 'Remote server kernel · OSI L4',
      abstraction: 'Two ratchets initialized: each side numbers its own bytes, each acknowledges the other’s',
      misconception: '"Sequence numbers start at 0" - only in Wireshark’s RELATIVE display. Real ISNs are randomized 32-bit values; predictable ISNs enabled the classic Mitnick-era spoofing attacks.',
      analogy: 'Two accountants opening ledgers at secret random page numbers, each confirming the other’s starting page before any entries.',
      protocol: 'TCP (RFC 9293 §3.5), ISN randomization (RFC 6528)',
      command: "tcpdump -ni any 'tcp[13] & 0x12 == 0x12'   # SYN+ACK packets\nss -tan state syn-recv",
      production: 'SYN-ACK retransmissions (net.ipv4.tcp_synack_retries, default 5) are a load-balancer health signal: rising synack retrans = clients vanishing mid-handshake, often a path or DDoS symptom.'
    }
  },

  {
    id: 'tcp-synack-return',
    chapter: 12,
    title: 'The whole journey — backwards, in one breath',
    node: 'nat',
    from: 'anycast',
    mode: 'net',
    state: { mode: 'net' },
    effects: ['zoomout'],
    packet: {
      label: 'SYN-ACK — de-NATted at the home router',
      layers: ['eth', 'ip', 'tcp'],
      fields: {
        eth: { 'Src MAC': 'a4:91:b1:0c:44:e2 (router)', 'Dst MAC': '3c:07:54:6a:2b:91 (laptop)' },
        ip: { 'Src': '104.18.32.7', 'Dst': '192.168.1.23  ← was 203.0.113.77', 'TTL': '57' },
        tcp: { 'Src Port': '443', 'Dst Port': '51324  ← was 38112', 'Seq': '3892217345', 'Ack': '1128394822', 'Flags': 'SYN, ACK' }
      }
    },
    explain: {
      what: "Compress 11 ms into one sentence: the SYN-ACK exits Cloudflare, rides carrier fiber back (its own BGP-chosen path - likely asymmetric to ours), sheds TTL at each hop (64→57), gets scheduled onto the DOCSIS downstream, and hits the home router - where conntrack recognizes the reply tuple 104.18.32.7:443 → 203.0.113.77:38112 and rewrites the DESTINATION back to 192.168.1.23:51324. The [UNREPLIED] flag clears; the mapping is now confirmed bidirectional. A fresh Ethernet frame carries it to the laptop's MAC.",
      why: "This is NAT's second half: the ledger written on the way out is consulted on the way in. No mapping, no entry - which is why unsolicited inbound connections die at this router, and why your services need port forwarding to be reachable.",
      component: 'netfilter PREROUTING de-NAT (conntrack reply-direction rewrite)',
      layer: 'Whole path · L1-L4 in reverse',
      abstraction: 'The concierge reading the tracking code on a reply letter and walking it to the right room',
      misconception: '"Replies retrace my packet’s exact route" - only the NAT rewrite is symmetric (it must be, same box). The internet path back is whatever CF’s and the carriers’ policies prefer; forward and reverse routes differ constantly.',
      analogy: 'A boomerang that returns via a different valley - but must funnel through the same front gate where its name badge is kept.',
      protocol: 'NAPT reply translation (RFC 3022); asymmetric inter-domain routing',
      command: 'conntrack -L | grep 38112     # [UNREPLIED] gone, ASSURED soon\ntcpdump -ni eth0 "tcp port 51324 and tcp[13] & 0x12 == 0x12"',
      production: 'Conntrack entries in SYN_SENT last only 120 s; established ones default to 5 DAYS (nf_conntrack_tcp_timeout_established) - long-lived idle flows through NAT die silently unless apps enable TCP keepalives below that horizon.'
    }
  },

  {
    id: 'tcp-client-rx',
    chapter: 12,
    title: 'Client RX in fast-forward: NIC → IRQ → softirq → TCP',
    node: 'irq',
    from: 'nat',
    mode: 'kernel',
    state: { mode: 'kernel', mem: 'kernel' },
    effects: ['irq'],
    explain: {
      what: "The laptop's NIC DMA-writes the SYN-ACK into an RX ring buffer and fires a hardware interrupt. The IRQ handler does almost nothing - it schedules NET_RX softirq and exits; the softirq's NAPI poll loop then harvests the ring, and the packet climbs ip_rcv() → tcp_v4_rcv() to our socket. That is the 10-second tour; chapter 23 walks this receive path step by step when the HTTP response arrives - for now, just know the SYN-ACK made it to TCP.",
      why: "Interrupt handlers must be nearly instant (they preempt everything), so Linux splits RX into a tiny 'top half' (IRQ: acknowledge, schedule) and a batched 'bottom half' (softirq/NAPI: actually process). The full anatomy deserves its own chapter - and gets one.",
      component: 'NIC RX ring → hardirq → NET_RX_SOFTIRQ → NAPI poll (net/core/dev.c)',
      layer: 'Client kernel · L1→L4 ascent',
      abstraction: 'A doorbell wakes the house; the actual unpacking happens calmly afterwards in batches',
      misconception: '"Each packet costs one interrupt" - under load, NAPI disables per-packet IRQs and polls the ring, amortizing one interrupt across dozens of packets. Interrupt moderation is why loaded servers do not die of IRQ storms.',
      analogy: 'The mail slot clacks once (IRQ); you finish your sentence, then collect ALL the letters that piled up (NAPI poll).',
      protocol: 'Hardware IRQ (MSI-X) → softirq → IPv4/TCP demux',
      command: 'grep eth0 /proc/interrupts        # MSI-X vectors per RX queue\ncat /proc/softirqs | grep NET_RX   # per-CPU softirq counts',
      production: 'IRQ affinity (which CPU takes which queue’s interrupts) is real tuning: irqbalance defaults are fine until they are not - high-PPS boxes pin queues to cores and align RSS, XPS, and application threads for cache locality.'
    }
  },

  {
    id: 'tcp-established',
    chapter: 12,
    title: 'SYN_SENT → ESTABLISHED — and the third leg flies',
    node: 'tcp',
    mode: 'kernel',
    state: { sock: 'ESTABLISHED' },
    effects: ['flash'],
    packet: {
      label: 'ACK — handshake leg 3 of 3',
      layers: ['eth', 'ip', 'tcp'],
      fields: {
        eth: { 'Src MAC': '3c:07:54:6a:2b:91', 'Dst MAC': 'a4:91:b1:0c:44:e2' },
        ip: { 'Src': '192.168.1.23', 'Dst': '104.18.32.7', 'TTL': '64' },
        tcp: { 'Src Port': '51324', 'Dst Port': '443', 'Seq': '1128394822', 'Ack': '3892217346', 'Flags': 'ACK', 'Window': '64256' }
      }
    },
    explain: {
      what: "tcp_rcv_synsent_state_process() checks the SYN-ACK: does ack 1128394822 correctly acknowledge our SYN? Yes. It records the server's ISN and options, moves the socket SYN_SENT → ESTABLISHED, and immediately emits the third leg: a bare ACK with seq 1128394822, ack 3892217346 (server ISN + 1). When that lands, the server promotes its half-open entry to the accept queue too. Both byte streams are now open for business.",
      why: "Three legs is the provable minimum for both sides to know that both directions work AND that both ISNs are agreed: SYN proves client→server, SYN-ACK proves server→client plus acknowledges, ACK closes the loop. Two would leave the server unsure its ISN arrived.",
      component: 'Client TCP state machine (net/ipv4/tcp_input.c: tcp_rcv_synsent_state_process)',
      layer: 'Client kernel · OSI L4',
      abstraction: 'A two-party contract: offer, counter-offer-with-acceptance, acceptance',
      misconception: '"The handshake exchanges data slowly" - the handshake carries ZERO application bytes (barring TFO); it costs exactly one RTT. What people feel as slow connections is usually this RTT × (1 for TCP + 1 for TLS) before any content moves.',
      analogy: '"Can you hear me?" - "I hear you, can you hear me?" - "I hear you." Only now does the meeting start.',
      protocol: 'TCP three-way handshake (RFC 9293 §3.5)',
      command: 'ss -tan state established dst 104.18.32.7\n# ESTAB 0 0 192.168.1.23:51324 104.18.32.7:443',
      production: 'Handshake failures split cleanly: SYN retransmits (nothing came back → path/firewall), vs RST received (something answered → wrong port/service). nstat TcpExtTCPSynRetrans is the first counter checked for "can’t connect" tickets.'
    },
    code: [
      { title: 'State transition in the kernel', lang: 'c', code: 'tcp_rcv_synsent_state_process(sk, skb, th)\n  /* validate ack: snd_una < ack <= snd_nxt */\n  tcp_finish_connect(sk, skb);\n    tcp_set_state(sk, TCP_ESTABLISHED);\n    /* record peer ISN, MSS, wscale, SACK, timestamps */\n  tcp_send_ack(sk);          /* leg 3: bare ACK */\n  sk->sk_state_change(sk);   /* wake epoll waiters → EPOLLOUT */' }
    ]
  },

  {
    id: 'tcp-rtt-cwnd',
    chapter: 12,
    title: 'First RTT sample: 24 ms — and a 10-segment allowance',
    node: 'tcp',
    mode: 'kernel',
    explain: {
      what: "The SYN→SYN-ACK round trip is TCP's first RTT measurement: ~24 ms. tcp_rtt_estimator() seeds srtt = 24 ms and rttvar, giving RTO = srtt + 4×rttvar (clamped to ≥200 ms minimum). Congestion control (CUBIC by default) starts with initial cwnd = 10 segments (RFC 6928) - the connection may push ~14.6 KB into the network before the first application-data ACK returns.",
      why: "TCP self-clocks off measured RTT: retransmission timers, congestion window growth, everything derives from this number. IW10 (raised from 3 in 2013) exists because most web responses fit in ~15 KB - one initial window - turning slow-start from three round trips into zero extra ones.",
      component: 'RTT estimation + congestion control (tcp_input.c, net/ipv4/tcp_cubic.c)',
      layer: 'Client kernel · OSI L4',
      abstraction: 'A feedback controller calibrating its clock from its own echo',
      misconception: '"Bandwidth determines page load speed" - below ~5 Mb/s maybe; above it, RTT dominates. A handshake-heavy HTTPS request needs 2-3 RTTs before first byte: at 24 ms that is 72 ms; at 200 ms (satellite) it is 600 ms on identical bandwidth.',
      analogy: 'A new courier route: time the first delivery, set your "assume it’s lost" alarm from that, and only send 10 parcels before hearing back.',
      protocol: 'RTT/RTO (RFC 6298), initial window 10 (RFC 6928), CUBIC (RFC 9438)',
      command: 'ss -ti dst 104.18.32.7\n# ... rtt:24.1/3.2 cwnd:10 ssthresh: mss:1460 ...',
      production: 'BBR vs CUBIC is a real deployment decision: CUBIC backs off on loss (suffers on lossy links), BBR models bandwidth×RTT (better on long-fat/lossy paths, occasionally unfair). ss -ti is the ground truth during any throughput investigation.'
    },
    code: [
      { title: 'Socket internals', lang: 'bash', code: '$ ss -ti state established dst 104.18.32.7\nESTAB 0 0  192.168.1.23:51324  104.18.32.7:443\n    cubic wscale:10,7 rto:224 rtt:24.1/3.2 mss:1460\n    cwnd:10 bytes_acked:1 segs_out:2 segs_in:1\n    send 4.8Mbps rcv_space:64240\n# rto:224 = srtt + 4*rttvar, floor-clamped' }
    ]
  },

  {
    id: 'tcp-epollout',
    chapter: 12,
    title: 'EPOLLOUT: connect() resolves, userspace wakes',
    node: 'netservice',
    mode: 'user',
    state: { mode: 'user', mem: 'user' },
    effects: ['ctx'],
    explain: {
      what: "When the socket went ESTABLISHED, sk_state_change() fired ep_poll_callback, marking the fd ready in the epoll instance. The network service's event loop (Chrome's network thread here; libuv's uv__io_poll in Node) returns from epoll_wait with EPOLLOUT on fd 42, checks getsockopt(SO_ERROR) == 0, and declares the non-blocking connect() a success. The TCPConnectJob completes; the socket is handed to the next layer - which, for an https URL, is TLS.",
      why: "This is the async model closing its loop: nothing ever blocked on the 24 ms handshake. The thread served other work and was woken by an event, not a timer. Every high-concurrency runtime - browsers, Node, nginx - lives on exactly this pattern.",
      component: 'epoll wakeup path (fs/eventpoll.c: ep_poll_callback) → Chrome net::TCPConnectJob / libuv',
      layer: 'User space · syscall boundary',
      abstraction: 'Registered curiosity: "wake me when THIS becomes writable" - and it did',
      misconception: '"Non-blocking connect() returning -1 EINPROGRESS is an error" - it is the design: the syscall starts the handshake and returns immediately; completion is signaled via writability, and SO_ERROR disambiguates success from failure. Wrapping connect in retry-on-any-error breaks this.',
      analogy: 'Dropping your car at the shop with your phone number. The buzz 24 minutes later IS the completion event - you never stood in the garage.',
      protocol: 'POSIX non-blocking connect + epoll (man 7 epoll, man 2 connect EINPROGRESS)',
      command: 'strace -e epoll_wait,getsockopt -p 4903 2>&1 | head\n# epoll_wait(...) = 1  [{EPOLLOUT, {fd=42}}]\n# getsockopt(42, SOL_SOCKET, SO_ERROR, [0], [4]) = 0',
      production: 'Connect latency histograms (p50/p99 handshake time) are a standard SLI; a p99 spike with clean p50 usually means a subset of paths (one PoP, one AZ) degrading - not general overload.'
    }
  },

  /* ══════════════ CHAPTER 13 — TLS HANDSHAKE (BRANCH https/http) ══════════════ */

  {
    id: 'tls-scheme-branch',
    chapter: 13,
    title: 'A TCP pipe exists. Encrypt it, or not?',
    node: 'netservice',
    mode: 'user',
    branch: {
      key: 'scheme',
      question: 'The URL scheme decides what happens next on this freshly opened socket.',
      options: [
        { value: 'https', label: 'https:// — TLS 1.3 handshake', hint: 'One extra round trip buys confidentiality, integrity, and server authentication. Then ALPN picks HTTP/2.' },
        { value: 'http', label: 'http:// — send it in the clear', hint: 'Zero extra round trips. Every device on the path can read and rewrite your request. Browsers label it Not Secure.' }
      ]
    },
    explain: {
      what: "The socket is ESTABLISHED and writable. What the connection layer does with it is decided purely by the URL scheme: https means run a TLS handshake before any HTTP byte; http means write the request bytes straight onto the socket. Same TCP connection, radically different threat model.",
      why: "TLS is not part of TCP - it is an application-layer protocol that happens to be a byte-stream transform. Understanding it as a separate negotiation riding on top explains why HTTPS costs an extra RTT and why the handshake can fail while the TCP connection is perfectly healthy.",
      component: 'Connection layer scheme dispatch (Chrome net::SSLConnectJob vs plain HttpStream)',
      layer: 'User space · OSI L5/L6 decision',
      abstraction: 'A transparent byte-stream wrapper that can be inserted, or not',
      misconception: '"HTTPS is a different protocol from HTTP" - it is the SAME HTTP, written into an encrypted stream. Swap TLS out and the bytes above are byte-for-byte identical (well, until HTTP/2 changed the framing for other reasons).',
      analogy: 'The same letter, either dropped in a public tray or sealed in a tamper-evident diplomatic pouch first.',
      protocol: 'TLS 1.3 (RFC 8446) over TCP, vs bare HTTP/1.1 (RFC 9112)',
      command: 'openssl s_client -connect api.shop.dev:443 -tls1_3\ncurl -v http://api.shop.dev/products?limit=20   # watch the 301 to https',
      production: 'HSTS (Strict-Transport-Security) plus preload removes the choice entirely: the browser refuses plaintext for the domain before a single packet is sent. Every serious API sets it with a long max-age.'
    }
  },

  {
    id: 'tls-http-plaintext',
    chapter: 13,
    title: 'Plaintext: the request rides naked',
    node: 'netservice',
    mode: 'user',
    when: { scheme: 'http' },
    packet: {
      label: 'HTTP request in the clear',
      layers: ['eth', 'ip', 'tcp', 'http'],
      fields: {
        ip: { 'Src': '192.168.1.23', 'Dst': '104.18.32.7', 'TTL': '64' },
        tcp: { 'Src Port': '51324', 'Dst Port': '80', 'Flags': 'PSH, ACK' },
        http: { 'Request': 'GET /products?limit=20 HTTP/1.1', 'Host': 'api.shop.dev', 'Cookie': 'session=eyJhbGci... ← readable by anyone', 'Authorization': 'Bearer eyJ0eXAi... ← readable by anyone' }
      }
    },
    explain: {
      what: "No handshake, no negotiation - the ASCII request bytes go straight into the socket. Every byte is legible to anything on the path: the Wi-Fi neighbor sniffing the air, the coffee-shop router, your ISP, every backbone operator, every transparent proxy. The session cookie and bearer token are in plain view, replayable by anyone who copies them.",
      why: "This is the world before ~2015, and why Let's Encrypt, HSTS, and browser shaming campaigns happened. On plaintext HTTP, authentication tokens are effectively public credentials on a shared medium.",
      component: 'HTTP/1.1 over raw TCP',
      layer: 'User space · OSI L7',
      abstraction: 'A postcard: readable, and forgeable, by every carrier who touches it',
      misconception: '"It is only a GET of public data, plaintext is fine" - the request carries cookies and tokens, and the RESPONSE can be modified in flight. Confidentiality is only half of it; integrity is what stops injected ads, tracking headers, and malware.',
      analogy: 'Reading your bank PIN aloud on a train because you are only checking a balance.',
      protocol: 'HTTP/1.1 (RFC 9112) with no transport security',
      command: 'tcpdump -ni eth0 -A "tcp port 80 and greater 100" | head -30\n# the entire request, human-readable, no tooling required',
      production: 'Port 80 today should exist only to 301 to HTTPS (and serve ACME challenges). Anything else is a finding in every security audit and a browser warning in every address bar.'
    },
    code: [
      { title: 'What a passive tap sees', lang: 'bash', code: '$ sudo tcpdump -ni eth0 -A "tcp port 80" | sed -n "1,12p"\nGET /products?limit=20 HTTP/1.1\nHost: api.shop.dev\nUser-Agent: Mozilla/5.0 ...\nAccept: application/json\nCookie: session=eyJhbGciOiJIUzI1NiJ9.eyJ1aWQiOjQyfQ.8sT2\nAuthorization: Bearer eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...\n\n# ← that cookie is now the attacker’s session' }
    ]
  },

  {
    id: 'tls-http-middlebox',
    chapter: 13,
    title: 'Not Secure: every middlebox is an author',
    node: 'ispcore',
    mode: 'net',
    when: { scheme: 'http' },
    state: { mode: 'net' },
    explain: {
      what: "Plaintext is not merely readable - it is writable. ISPs have historically injected data-cap banners and ads into HTTP responses; hotel and airport portals rewrite pages routinely; state-level actors have injected malicious JavaScript into plain HTTP (the 2015 'Great Cannon' turned an analytics script into a DDoS weapon). Browsers now mark http:// pages Not Secure, block mixed content, and gate powerful APIs (service workers, geolocation, WebAuthn) behind secure contexts entirely.",
      why: "Integrity is the underrated half of TLS. Encryption stops reading; the MAC/AEAD tag stops modification. Without it, the code your users run is whatever the last hop decided to send.",
      component: 'Transparent proxies, content injectors, captive portals along the path',
      layer: 'Network path · OSI L7 tampering',
      abstraction: 'An unsealed letter that every postal worker may append to',
      misconception: '"HTTPS is about hiding secrets" - equally it is about knowing the bytes you received are the bytes the server sent, from the server you think you are talking to. Authentication + integrity + confidentiality, in that order of underappreciation.',
      analogy: 'Sending a contract by open courier and discovering an extra clause when it arrives.',
      protocol: 'None - that is precisely the problem',
      command: 'curl -sI http://api.shop.dev/products | grep -i "x-injected\\|via\\|server"\n# compare byte-for-byte against the https response',
      production: 'This is the entire argument for HTTPS-everywhere plus HSTS preload. From here we assume the https branch; nothing below this point in the story is safe without it.'
    }
  },

  {
    id: 'tls-clienthello',
    chapter: 13,
    title: 'ClientHello: SNI, ALPN, and a key share up front',
    node: 'tcp',
    from: 'netservice',
    mode: 'user',
    when: { scheme: 'https' },
    packet: {
      label: 'TLS ClientHello (flight 1)',
      layers: ['eth', 'ip', 'tcp', 'tls'],
      fields: {
        ip: { 'Src': '192.168.1.23', 'Dst': '104.18.32.7', 'TTL': '64' },
        tcp: { 'Src Port': '51324', 'Dst Port': '443', 'Seq': '1128394822', 'Flags': 'PSH, ACK', 'Len': '517' },
        tls: {
          'Record': 'Handshake, legacy_version 0x0303',
          'Type': 'ClientHello',
          'supported_versions': 'TLS 1.3 (0x0304)',
          'SNI': 'api.shop.dev  ← in the clear',
          'ALPN': 'h2, http/1.1',
          'Cipher suites': 'TLS_AES_128_GCM_SHA256, TLS_AES_256_GCM_SHA384, TLS_CHACHA20_POLY1305_SHA256',
          'key_share': 'X25519 public key (32 bytes)',
          'Random': '32 bytes client entropy'
        }
      }
    },
    explain: {
      what: "The client opens with a ClientHello carrying: 32 random bytes, its cipher suite list, supported_versions announcing TLS 1.3, SNI = api.shop.dev so an anycast edge serving millions of domains knows which certificate to present, ALPN offering h2 then http/1.1, and - the TLS 1.3 innovation - a key_share: an ephemeral X25519 public key sent SPECULATIVELY, before knowing whether the server likes that group.",
      why: "That speculative key share is exactly why TLS 1.3 is 1-RTT: the client guesses the group correctly ~always, so the server can compute the shared secret and start encrypting in its very first reply. TLS 1.2 needed a whole extra round trip just to agree on parameters first.",
      component: 'BoringSSL/OpenSSL client (SSL_do_handshake) inside the network service',
      layer: 'User space · OSI L5/L6',
      abstraction: 'An opening offer that includes your half of the shared secret pre-emptively',
      misconception: '"TLS encrypts everything including the hostname" - SNI is plaintext in the ClientHello (Encrypted Client Hello is still rolling out). Anyone on-path sees WHICH site you visit, just not what you do there.',
      analogy: 'Walking up to a door and simultaneously saying who you want to see, which languages you speak, and handing over half a torn banknote to be matched.',
      protocol: 'TLS 1.3 ClientHello (RFC 8446 §4.1.2); SNI RFC 6066; ALPN RFC 7301',
      command: 'openssl s_client -connect api.shop.dev:443 -servername api.shop.dev -alpn h2,http/1.1 -tls1_3\ntcpdump -ni eth0 -X "tcp port 443 and tcp[((tcp[12]&0xf0)>>2)]=22" | head',
      production: 'JA3/JA4 fingerprints hash exactly these ClientHello fields; CDNs and WAFs use them to spot bots whose TLS stack does not match their claimed User-Agent. If you spoof a browser UA from curl, your TLS fingerprint gives you away.'
    },
    code: [
      { title: 'Handshake flight, observed', lang: 'bash', code: '$ openssl s_client -connect api.shop.dev:443 -servername api.shop.dev \\\n      -alpn h2,http/1.1 -tls1_3 -brief\nCONNECTED(00000003)\nProtocol version: TLSv1.3\nCiphersuite: TLS_AES_128_GCM_SHA256\nPeer certificate: CN = api.shop.dev\nHash used: SHA256\nSignature type: ECDSA\nNegotiated TLS1.3 group: X25519\nALPN protocol: h2' }
    ],
    prod: {
      title: 'ClientHello for api.islandtours.io',
      explain: { production: 'Island Tours terminates TLS at Cloudflare too, so the ClientHello carries SNI api.islandtours.io. The origin certificate behind it is a Cloudflare Origin CA cert - free, 15-year, and only trusted by Cloudflare, which is fine because nobody else should reach the origin directly.' },
      code: [
        { title: 'Verify the edge cert', lang: 'bash', code: '$ openssl s_client -connect api.islandtours.io:443 \\\n      -servername api.islandtours.io -tls1_3 -brief 2>/dev/null\nProtocol version: TLSv1.3\nCiphersuite: TLS_AES_128_GCM_SHA256\nPeer certificate: CN = islandtours.io\nALPN protocol: h2' }
      ]
    }
  },

  {
    id: 'tls-serverhello',
    chapter: 13,
    title: 'ServerHello + ECDHE: a shared secret from two public keys',
    node: 'cftls',
    mode: 'remote',
    state: { mode: 'remote' },
    packet: {
      label: 'ServerHello + EncryptedExtensions (flight 2 begins)',
      layers: ['ip', 'tcp', 'tls'],
      fields: {
        ip: { 'Src': '104.18.32.7', 'Dst': '203.0.113.77', 'TTL': '64' },
        tcp: { 'Src Port': '443', 'Dst Port': '38112', 'Flags': 'PSH, ACK' },
        tls: {
          'Type': 'ServerHello',
          'Cipher': 'TLS_AES_128_GCM_SHA256',
          'key_share': 'X25519 server public key',
          'supported_versions': 'TLS 1.3',
          'Then (encrypted)': 'EncryptedExtensions {ALPN: h2}'
        }
      }
    },
    explain: {
      what: "The edge picks TLS_AES_128_GCM_SHA256 and returns its own ephemeral X25519 public key. Both sides now compute the same 32-byte ECDHE shared secret from (their private, peer public) - a value never transmitted. HKDF-Extract/Expand runs it through the transcript hash to derive handshake traffic keys, and from this point on every remaining handshake message is ENCRYPTED - including the certificate and the negotiated ALPN, which arrive in EncryptedExtensions.",
      why: "Encrypting the rest of the handshake is a TLS 1.3 privacy upgrade: in 1.2 the server certificate was sent in cleartext, so passive observers learned exactly which site (and which cert) you were fetching even beyond SNI.",
      component: 'Cloudflare TLS terminator (BoringSSL) at the anycast edge',
      layer: 'Remote edge · OSI L5/L6',
      abstraction: 'Two strangers mixing paint in public and both ending up with the same private color',
      misconception: '"The server sends the session key encrypted with its public key" - that was RSA key transport, removed in TLS 1.3 precisely because it lacks forward secrecy. Modern TLS DERIVES the key on both sides; the key never crosses the wire in any form.',
      analogy: 'Diffie-Hellman as the classic paint analogy: swap mixed colors publicly, add your own secret pigment, arrive at an identical shade nobody watching can reproduce.',
      protocol: 'TLS 1.3 ServerHello + key schedule (RFC 8446 §7.1); X25519 (RFC 7748)',
      command: 'openssl s_client -connect api.shop.dev:443 -tls1_3 2>&1 | grep -E "group|Cipher"\n# Negotiated TLS1.3 group: X25519',
      production: 'Cipher/group policy is auditable surface: disable everything below TLS 1.2, prefer AEAD suites, and watch for post-quantum hybrid groups (X25519MLKEM768) which are now default in Chrome and enabled at major CDNs.'
    },
    code: [
      { title: 'TLS 1.3 key schedule', lang: 'c', code: '             0\n             |\n             v\n   PSK ->  HKDF-Extract = Early Secret\n             |\n         Derive-Secret(., "derived", "")\n             |\n(EC)DHE ->  HKDF-Extract = Handshake Secret\n             |  +-> client_handshake_traffic_secret\n             |  +-> server_handshake_traffic_secret\n         Derive-Secret(., "derived", "")\n             |\n     0 ->  HKDF-Extract = Master Secret\n                +-> client_application_traffic_secret_0\n                +-> server_application_traffic_secret_0' }
    ]
  },

  {
    id: 'tls-certificate',
    chapter: 13,
    title: 'The certificate chain arrives (encrypted)',
    node: 'cftls',
    mode: 'remote',
    packet: {
      label: 'Certificate + CertificateVerify + Finished',
      layers: ['ip', 'tcp', 'tls'],
      fields: {
        ip: { 'Src': '104.18.32.7', 'Dst': '203.0.113.77' },
        tcp: { 'Src Port': '443', 'Dst Port': '38112', 'Flags': 'PSH, ACK' },
        tls: {
          'Certificate': 'leaf: CN=api.shop.dev (ECDSA P-256), SAN: api.shop.dev, *.shop.dev',
          'Chain': '+ intermediate: Cloudflare Inc ECC CA-3',
          'CertificateVerify': 'ECDSA signature over the handshake transcript',
          'Finished': 'HMAC over transcript with handshake key',
          'SCTs': '2 embedded Certificate Transparency timestamps'
        }
      }
    },
    explain: {
      what: "Under handshake encryption the server sends its certificate chain - leaf for api.shop.dev plus the intermediate CA - then CertificateVerify: a signature, made with the private key matching the leaf's public key, over the entire handshake transcript so far. Finally Finished, an HMAC proving both sides derived identical keys. The root CA is deliberately NOT sent; the client already has it.",
      why: "CertificateVerify is the actual proof of identity. Anyone can copy a public certificate; only the holder of the private key can sign this connection's unique transcript. That signature is what binds 'this certificate' to 'this live connection'.",
      component: 'Cloudflare edge certificate store (SNI-selected, thousands per server)',
      layer: 'Remote edge · OSI L6',
      abstraction: 'A passport (certificate) plus a live signature proving you are its holder',
      misconception: '"The server sends the whole chain up to the root" - it must not; roots come from the client trust store. Sending a root is wasted bytes, and a chain MISSING its intermediate is the classic "works in Chrome, fails on Android/curl" bug (browsers cache intermediates via AIA, other clients do not).',
      analogy: 'Showing ID at a bar and then signing a slip on the spot - the signature matching the ID is what proves it is yours, not stolen.',
      protocol: 'TLS 1.3 Certificate/CertificateVerify (RFC 8446 §4.4); X.509 (RFC 5280); CT (RFC 6962)',
      command: 'openssl s_client -connect api.shop.dev:443 -showcerts </dev/null 2>/dev/null | grep -E "^ *[0-9] s:|i:"\ncurl -vI https://api.shop.dev 2>&1 | grep -E "subject|issuer|expire"',
      production: 'Chain-completeness and expiry are the top two TLS incidents in the wild. Monitor NotAfter externally (not from the box that renews), and test with `openssl s_client -verify_return_error` against a clean trust store, not just a browser.'
    },
    code: [
      { title: 'The presented chain', lang: 'bash', code: '$ openssl s_client -connect api.shop.dev:443 -servername api.shop.dev \\\n      -showcerts </dev/null 2>/dev/null | grep -E "^ ?[0-9] s:|^ ?[0-9]? ?i:"\n 0 s:CN = api.shop.dev\n   i:C = US, O = "Cloudflare, Inc.", CN = Cloudflare Inc ECC CA-3\n 1 s:C = US, O = "Cloudflare, Inc.", CN = Cloudflare Inc ECC CA-3\n   i:C = IE, O = Baltimore, CN = Baltimore CyberTrust Root\n# root not sent — it must already be in the client trust store' }
    ]
  },

  {
    id: 'tls-cert-verify',
    chapter: 13,
    title: 'Client verification: chain, dates, name, revocation, CT',
    node: 'netservice',
    from: 'cftls',
    mode: 'user',
    state: { mode: 'user' },
    quiz: {
      q: 'A certificate is valid, unexpired, and chains to a trusted root - but was issued for shop.dev with SAN shop.dev only. You requested api.shop.dev. What happens?',
      options: [
        'It is accepted - same registered domain',
        'ERR_CERT_COMMON_NAME_INVALID: no SAN entry matches the requested hostname',
        'The browser prompts to add an exception automatically'
      ],
      answer: 1,
      explain: 'Hostname matching is a separate, mandatory check against subjectAltName (CN has been ignored by modern browsers for years). Wildcards match one label only: *.shop.dev covers api.shop.dev but not a.b.shop.dev, and shop.dev alone covers neither.'
    },
    explain: {
      what: "The client now runs the gauntlet: (1) verify the leaf's signature with the intermediate's public key, and the intermediate's with a root already in the OS/browser trust store; (2) check notBefore/notAfter on every cert; (3) match the requested hostname against subjectAltName - CN is ignored; (4) check revocation (CRLite/OneCRL in Firefox, CRLSets in Chrome, OCSP stapling where present); (5) require Certificate Transparency proof - at least two SCTs from qualified logs, or Chrome rejects it outright.",
      why: "Everything above rests on this: the ECDHE secret proves you are talking to SOMEBODY privately; only certificate verification proves that somebody is api.shop.dev. Skip it and an active attacker simply offers their own key and reads everything.",
      component: 'Certificate verifier + OS/browser trust store (~150 roots)',
      layer: 'User space · OSI L6 / PKI',
      abstraction: 'Delegated trust: I trust ~150 roots, they vouch for intermediates, which vouch for this leaf',
      misconception: '"The padlock means the site is safe" - it means the connection is private and the NAME matched. Phishing sites get valid certs in minutes. The padlock authenticates the domain, never the intent behind it.',
      analogy: 'Checking a passport: is it signed by a government you recognize, is it in date, does the photo match the person, and has it been reported stolen?',
      protocol: 'RFC 5280 path validation; RFC 6125 hostname verification; RFC 6962 CT',
      command: 'openssl s_client -connect api.shop.dev:443 -servername api.shop.dev \\\n  -verify_return_error -CApath /etc/ssl/certs </dev/null\ncurl -s "https://crt.sh/?q=shop.dev&output=json" | head   # public CT logs',
      production: 'CT logs are free monitoring: subscribe to crt.sh alerts for your domains and you learn within minutes if any CA issues a cert you did not request. CAA DNS records restrict which CAs may issue at all.'
    },
    code: [
      { title: 'Verification failing loudly', lang: 'bash', code: '$ openssl s_client -connect expired.badssl.com:443 -verify_return_error </dev/null\nverify error:num=10:certificate has expired\nnotAfter=Apr 12 23:59:59 2021 GMT\nverify return:1\n# browser equivalent: NET::ERR_CERT_DATE_INVALID' }
    ]
  },

  {
    id: 'tls-client-finished',
    chapter: 13,
    title: 'Client Finished — and the keys change again',
    node: 'tcp',
    from: 'netservice',
    mode: 'user',
    when: { scheme: 'https' },
    packet: {
      label: 'Client Finished (flight 3) — handshake complete',
      layers: ['eth', 'ip', 'tcp', 'tls'],
      fields: {
        ip: { 'Src': '192.168.1.23', 'Dst': '104.18.32.7', 'TTL': '64' },
        tcp: { 'Src Port': '51324', 'Dst Port': '443', 'Flags': 'PSH, ACK' },
        tls: { 'Type': 'Finished (encrypted)', 'Verify data': 'HMAC over full transcript', 'Next records': 'application_data with APPLICATION keys' }
      }
    },
    explain: {
      what: "The client sends its own Finished: an HMAC over the complete handshake transcript using its handshake traffic secret. Both sides then derive the application traffic secrets (client_application_traffic_secret_0 / server_...) via the key schedule and switch. Any tampering anywhere in the handshake - a downgraded cipher list, a stripped extension - produces different transcript hashes and Finished fails immediately.",
      why: "Finished is the handshake's own integrity check, retroactively protecting the negotiation that happened before encryption started. It is why downgrade attacks against TLS 1.3 do not work: you cannot silently edit messages that both sides later hash and compare.",
      component: 'TLS state machine transition to application data keys',
      layer: 'User space · OSI L6',
      abstraction: 'Both parties reading back the entire conversation to confirm they heard it identically',
      misconception: '"One key protects the session" - there are separate directional keys, they differ between handshake and application phases, and TLS 1.3 supports KeyUpdate to rotate mid-connection. A 0-RTT phase has its own weaker keys again.',
      analogy: 'Ending a negotiation by both sides initialing every page of the minutes - any discrepancy and the deal is void.',
      protocol: 'TLS 1.3 Finished (RFC 8446 §4.4.4)',
      command: 'SSLKEYLOGFILE=/tmp/keys.log chromium https://api.shop.dev\n# then in Wireshark: TLS → (Pre)-Master-Secret log filename → decrypted view',
      production: 'SSLKEYLOGFILE + Wireshark is the sanctioned way to debug TLS payloads in dev. In production, prefer app-level logging - key logs are session-compromise material.'
    }
  },

  {
    id: 'tls-alpn-h2',
    chapter: 13,
    title: 'ALPN says h2 — and 1-RTT is why this felt fast',
    node: 'cftls',
    mode: 'remote',
    state: { mode: 'remote' },
    explain: {
      what: "EncryptedExtensions carried the ALPN result: h2. HTTP/2 was chosen inside the handshake, costing zero extra round trips - no Upgrade dance, no probing. Total TLS cost: ONE round trip (~24 ms), because the client's speculative key_share let the server encrypt from its very first flight. TLS 1.2 needed two RTTs; a resumed TLS 1.3 session with a PSK can even send data at 0-RTT.",
      why: "Every saved round trip is 24 ms here - and 200+ ms on mobile. TCP handshake + TLS 1.3 = 2 RTTs before the first request byte, versus 3 for TLS 1.2. QUIC folds transport and crypto together to make it 1 total, which is the entire motivation for HTTP/3.",
      component: 'ALPN negotiation (RFC 7301) inside the TLS handshake',
      layer: 'Remote edge · OSI L6/L7 boundary',
      abstraction: 'Choosing the language of the meeting while still shaking hands',
      misconception: '"HTTP/2 requires TLS by spec" - it does not (h2c exists), but no browser implements cleartext h2, so in practice ALPN over TLS is the only way you get it.',
      analogy: 'Agreeing during the handshake itself which language you will speak, instead of starting in one and switching awkwardly.',
      protocol: 'ALPN (RFC 7301); HTTP/2 (RFC 9113); TLS 1.3 0-RTT (RFC 8446 §2.3)',
      command: 'openssl s_client -alpn h2,http/1.1 -connect api.shop.dev:443 </dev/null 2>/dev/null | grep ALPN\ncurl -sI --http2 https://api.shop.dev/products | head -1',
      production: '0-RTT data is replayable by design - only ever send idempotent requests in it. Cloudflare and most CDNs restrict 0-RTT to GET/HEAD without side effects for exactly that reason.'
    },
    code: [
      { title: 'TLS 1.3 vs 1.2, one RTT apart', lang: 'bash', code: 'TLS 1.3 (1-RTT):\n  C→S  ClientHello  + key_share + ALPN + SNI\n  S→C  ServerHello  + key_share {EncryptedExtensions, Cert,\n                      CertVerify, Finished}\n  C→S  {Finished}   + APPLICATION DATA          ← request rides along\n\nTLS 1.2 (2-RTT):\n  C→S  ClientHello\n  S→C  ServerHello, Certificate, ServerKeyExchange, HelloDone\n  C→S  ClientKeyExchange, ChangeCipherSpec, Finished\n  S→C  ChangeCipherSpec, Finished\n  C→S  APPLICATION DATA                          ← a full RTT later' }
    ]
  },

  {
    id: 'tls-forward-secrecy',
    chapter: 13,
    title: 'Forward secrecy: the keys die with the connection',
    node: 'cftls',
    mode: 'remote',
    explain: {
      what: "The X25519 private keys used here are ephemeral - generated for this connection, held in memory, discarded when it closes. The certificate's long-lived private key only SIGNED the transcript; it never encrypted anything. So an adversary recording this traffic today and stealing the server's private key next year still cannot decrypt it: the material needed no longer exists anywhere.",
      why: "Harvest-now-decrypt-later is a real adversary model. Forward secrecy makes mass retroactive decryption impossible per-connection, which is why TLS 1.3 removed static-RSA key transport entirely rather than merely discouraging it.",
      component: 'Ephemeral ECDHE key generation per connection',
      layer: 'Remote edge · cryptographic design',
      abstraction: 'A one-time pad of key material that is burned after reading',
      misconception: '"Stealing the server’s private key decrypts past traffic" - true for TLS 1.2 with RSA key exchange, false with (EC)DHE. It still lets an attacker IMPERSONATE the server going forward, which is why revocation and short-lived certs matter.',
      analogy: 'A safe whose combination is randomly reset per meeting and never written down - subpoenaing the building owner later gets you nothing.',
      protocol: 'ECDHE forward secrecy; TLS 1.3 mandates (EC)DHE or PSK-with-DHE',
      command: 'openssl s_client -connect api.shop.dev:443 -tls1_3 2>&1 | grep -i "group\\|Ciphersuite"\n# any suite negotiated by TLS 1.3 is forward-secret by construction',
      production: 'TLS session TICKETS can undermine this if ticket keys are long-lived and shared across a fleet - rotate them frequently (hours). Cloudflare and Google rotate ticket keys aggressively for exactly this reason.'
    }
  },

  /* ══════════════ CHAPTER 14 — HTTP REQUEST ══════════════ */

  {
    id: 'http-h2-preface',
    chapter: 14,
    title: 'HTTP/2 preface: 24 magic bytes and a SETTINGS frame',
    node: 'netservice',
    mode: 'user',
    state: { mode: 'user', mem: 'user' },
    explain: {
      what: "Before any request, the client writes HTTP/2's connection preface: the literal ASCII string \"PRI * HTTP/2.0\\r\\n\\r\\nSM\\r\\n\\r\\n\" followed by a SETTINGS frame (max concurrent streams, initial window size, header table size). The server answers with its own SETTINGS and both ACK. All of it is written into the TLS stream we just established - never in the clear.",
      why: "The preface is deliberately nonsense to an HTTP/1.1 parser: any legacy intermediary that thinks it understands the connection will choke immediately rather than silently mangle binary frames. SETTINGS then establishes flow-control and concurrency limits before the first request.",
      component: 'HTTP/2 session layer (Chrome net::SpdySession; nghttp2 in Node/nginx)',
      layer: 'User space · OSI L7',
      abstraction: 'A tripwire greeting that only a real HTTP/2 peer can survive',
      misconception: '"HTTP/2 is just HTTP/1.1 with compression" - it is a binary, multiplexed framing protocol with its own flow control, stream priorities, and server push (now deprecated). The SEMANTICS (methods, status codes, headers) are unchanged; the wire format is entirely different.',
      analogy: 'Starting a phone call with a distinctive modem screech - anything that is not a modem hangs up immediately.',
      protocol: 'HTTP/2 connection preface + SETTINGS (RFC 9113 §3.4, §6.5)',
      command: 'curl -v --http2 https://api.shop.dev/products?limit=20 2>&1 | grep -E "h2|SETTINGS"\nnghttp -nv https://api.shop.dev/products?limit=20 | head -20',
      production: 'SETTINGS_MAX_CONCURRENT_STREAMS (typically 100-250) caps parallelism per connection; too low re-creates HTTP/1 head-of-line queuing at the app layer. The 2023 Rapid Reset CVE was an abuse of stream creation/cancel - patched by rate-limiting stream churn.'
    },
    code: [
      { title: 'Connection startup, framed', lang: 'bash', code: '$ nghttp -nv https://api.shop.dev/products?limit=20\n[  0.024] Connected\n[  0.048] send SETTINGS frame <length=12, flags=0x00, stream_id=0>\n          (niv=2)\n          [SETTINGS_MAX_CONCURRENT_STREAMS(0x03):100]\n          [SETTINGS_INITIAL_WINDOW_SIZE(0x04):65535]\n[  0.049] recv SETTINGS frame <length=18, flags=0x00, stream_id=0>\n[  0.049] send SETTINGS frame <length=0, flags=0x01>  ; ACK' }
    ]
  },

  {
    id: 'http-headers-frame',
    chapter: 14,
    title: 'HEADERS frame on stream 1 — HPACK squeezes it',
    node: 'netservice',
    mode: 'user',
    packet: {
      label: 'HTTP/2 HEADERS — GET /products?limit=20',
      layers: ['tls', 'http'],
      fields: {
        tls: { 'Record': 'application_data (AES-128-GCM)' },
        http: {
          'Frame': 'HEADERS, stream_id=1, flags=END_HEADERS|END_STREAM',
          ':method': 'GET',
          ':scheme': 'https',
          ':authority': 'api.shop.dev',
          ':path': '/products?limit=20',
          'accept': 'application/json',
          'user-agent': 'Mozilla/5.0 ... Chrome/126.0',
          'HPACK': '~480 bytes of headers → 91 bytes on the wire'
        }
      }
    },
    explain: {
      what: "The request becomes a HEADERS frame on stream 1 (client-initiated streams are odd-numbered). HTTP/2 replaces the request line with pseudo-headers - :method, :scheme, :authority, :path - all lowercase, all binary-encoded. HPACK compresses them against a shared dynamic table plus a 61-entry static table: \":method GET\" is literally index 2, one byte. END_STREAM is set because a GET has no body.",
      why: "Header bloat was HTTP/1.1's quiet tax: 500-800 bytes of near-identical headers on every request, uncompressed, often exceeding the response for small API calls. HPACK's stateful table makes repeat requests on the same connection nearly free in header bytes.",
      component: 'HPACK encoder + HTTP/2 framing layer',
      layer: 'User space · OSI L7',
      abstraction: 'A shared codebook both ends maintain in lockstep, so common phrases become indices',
      misconception: '"HPACK is just gzip for headers" - it is a stateful index table, not a stream compressor. That design was deliberate: HTTP/2 avoided generic compression over attacker-influenced data to sidestep CRIME/BREACH-style oracle attacks.',
      analogy: 'Ordering "the usual, table 4" instead of reciting the entire menu item every visit.',
      protocol: 'HTTP/2 HEADERS frame (RFC 9113 §6.2); HPACK (RFC 7541)',
      command: 'nghttp -nv -H "accept: application/json" https://api.shop.dev/products?limit=20\ncurl --http2 -w "%{size_request} bytes sent\\n" -o /dev/null -s https://api.shop.dev/products?limit=20',
      production: 'HPACK dynamic tables cost memory per connection (SETTINGS_HEADER_TABLE_SIZE, default 4 KB); proxies serving millions of connections tune it down. Oversized header sets get REFUSED_STREAM or 431 - a real failure mode with large cookies and JWTs.'
    },
    code: [
      { title: 'HTTP/1.1 vs HTTP/2, same request', lang: 'bash', code: '# HTTP/1.1 — 412 bytes of ASCII, every time\nGET /products?limit=20 HTTP/1.1\nHost: api.shop.dev\nUser-Agent: Mozilla/5.0 (X11; Linux x86_64) ... Chrome/126.0.0.0\nAccept: application/json\nAccept-Encoding: gzip, deflate, br\n\n# HTTP/2 — HEADERS frame, HPACK-encoded, 91 bytes\n:method: GET          → static index 2      (1 byte)\n:scheme: https        → static index 7      (1 byte)\n:authority: api.shop.dev → dynamic index 62 (1 byte after first use)\n:path: /products?limit=20 → literal, Huffman-coded' }
    ],
    prod: {
      title: 'HEADERS frame — GET /tours',
      explain: { production: 'Island Tours fetches https://api.islandtours.io/tours with the same machinery: :authority api.islandtours.io, :path /tours, no query string. Cloudflare fronts it identically; only the pseudo-header values differ.' },
      code: [
        { title: 'The Island Tours request', lang: 'bash', code: '$ nghttp -nv https://api.islandtours.io/tours | grep -A8 "HEADERS"\n[  0.051] send HEADERS frame <length=48, flags=0x25, stream_id=1>\n          ; END_STREAM | END_HEADERS | PRIORITY\n          :method: GET\n          :scheme: https\n          :authority: api.islandtours.io\n          :path: /tours\n          accept: application/json' }
      ]
    }
  },

  {
    id: 'http-tls-records',
    chapter: 14,
    title: 'Encapsulation, all the way down',
    node: 'tcp',
    from: 'netservice',
    mode: 'kernel',
    state: { mode: 'kernel', mem: 'copy' },
    packet: {
      label: 'GET /products?limit=20 — five layers deep',
      layers: ['eth', 'ip', 'tcp', 'tls', 'http'],
      fields: {
        eth: { 'Src MAC': '3c:07:54:6a:2b:91', 'Dst MAC': 'a4:91:b1:0c:44:e2', 'EtherType': '0x0800' },
        ip: { 'Src': '192.168.1.23', 'Dst': '104.18.32.7', 'TTL': '64', 'Total Length': '211' },
        tcp: { 'Src Port': '51324', 'Dst Port': '443', 'Seq': '1128394855', 'Flags': 'PSH, ACK', 'Payload': '145 bytes' },
        tls: { 'Record': 'application_data, TLS 1.2 legacy version byte', 'Encrypted': 'AES-128-GCM + 16-byte auth tag' },
        http: { 'Inside (invisible on wire)': 'HEADERS frame, stream 1, GET /products?limit=20' }
      }
    },
    explain: {
      what: "SSL_write() wraps the HEADERS frame in a TLS record: header (type 23, version, length) plus AES-128-GCM ciphertext plus a 16-byte authentication tag. That ciphertext is written to fd 42, copied into the socket send buffer, segmented by TCP, prefixed with an IP header, framed in Ethernet - and out through the entire stack we spent nine chapters building. On the wire, only the TLS record header is legible; everything above it is indistinguishable from noise.",
      why: "This is the payoff of layering: the HTTP layer knows nothing about TCP segments, TCP knows nothing about TLS records, Ethernet knows nothing about any of it. Each layer only adds its own header and hands down.",
      component: 'TLS record layer → send() → tcp_sendmsg() → ip_queue_xmit() → dev_queue_xmit()',
      layer: 'User→kernel · OSI L7 down to L2',
      abstraction: 'Russian dolls: each layer wraps the one above and addresses only its own peer',
      misconception: '"One HTTP request = one TCP packet" - a request can span many segments, several small requests can share one segment, and TLS record boundaries align with neither. Never parse application protocols assuming packet boundaries.',
      analogy: 'A letter in an envelope, in a courier pouch, in a mail sack, on a truck - each handler reads only their own label.',
      protocol: 'TLS record layer (RFC 8446 §5) over TCP over IPv4 over Ethernet',
      command: 'tcpdump -ni eth0 -X "tcp port 443 and tcp[((tcp[12]&0xf0)>>2)]=23" | head -20\n# type 23 = application_data; contents are opaque ciphertext',
      production: 'TLS record size matters for latency: 16 KB records buffer more before anything is decryptable. nginx ssl_buffer_size 4k (vs default 16k) improves time-to-first-byte for small responses at a small throughput cost.'
    },
    code: [
      { title: 'Bytes on the wire', lang: 'c', code: '/* Ethernet   */ a4 91 b1 0c 44 e2 | 3c 07 54 6a 2b 91 | 08 00\n/* IPv4       */ 45 00 00 d3 ... 40 06 ... c0 a8 01 17 | 68 12 20 07\n/* TCP        */ c8 7c 01 bb | seq ... | 50 18 | win | cksum\n/* TLS record */ 17 03 03 00 91          <- type 23, len 145\n/* TLS payload*/ 8f 2a d1 ...            <- AES-128-GCM ciphertext\n/*            */ ... 16-byte GCM auth tag\n/* inside     */ [HTTP/2 HEADERS frame, stream 1]  <- unreadable on wire' }
    ]
  },

  {
    id: 'http-send-path',
    chapter: 14,
    title: 'The whole egress path again — this time in 6 ms',
    node: 'anycast',
    from: 'tcp',
    mode: 'net',
    state: { mode: 'net' },
    effects: ['zoomout'],
    packet: {
      label: 'Encrypted request — traversing the path we already know',
      layers: ['ip', 'tcp', 'tls'],
      fields: {
        ip: { 'Src': '203.0.113.77  (NAT applied)', 'Dst': '104.18.32.7', 'TTL': '64 → 60' },
        tcp: { 'Src Port': '38112', 'Dst Port': '443', 'Flags': 'PSH, ACK' },
        tls: { 'Record': 'application_data (opaque)' }
      }
    },
    explain: {
      what: "NIC → switch → router → conntrack (existing entry, fast path, no new mapping) → modem → headend → ISP core → peering → Cloudflare edge. Roughly 12 ms one way. The difference from the SYN's journey: every stateful device along the way already knows this flow. Conntrack matches an ESTABLISHED entry instead of creating one; the router's hardware offload may forward it without the CPU ever seeing it; TCP is out of slow start's first step and cwnd has grown.",
      why: "First packets are expensive, subsequent packets are cheap. This asymmetry - state setup versus state reuse - is why connection reuse, keep-alive, and connection pooling produce such outsized wins, and why cold connections dominate tail latency.",
      component: 'The entire egress path, now warm',
      layer: 'Full stack traversal · L7→L1→L7',
      abstraction: 'A path that is only expensive the first time you walk it',
      misconception: '"Every packet gets fully processed by every device" - established flows hit fast paths everywhere: NIC flow steering, conntrack ESTABLISHED, hardware NAT offload, ASIC forwarding. Only the first packet of a flow does the full expensive dance.',
      analogy: 'The second time through airport security with pre-check: same building, a tenth of the friction.',
      protocol: 'Same stack - IP/TCP/TLS - traversed with warm state everywhere',
      command: 'curl -w "connect:%{time_connect}s tls:%{time_appconnect}s ttfb:%{time_starttransfer}s\\n" \\\n  -o /dev/null -s https://api.shop.dev/products?limit=20',
      production: 'curl -w timing breakdowns are the fastest triage tool alive: high time_connect = network/SYN, high time_appconnect = TLS/cert, high time_starttransfer = server think time. It separates three teams’ problems in one command.'
    },
    code: [
      { title: 'Where the milliseconds went', lang: 'bash', code: '$ curl -w "@fmt" -o /dev/null -s https://api.shop.dev/products?limit=20\ndns_lookup:      0.0180 s   ← chapter 5\ntcp_connect:     0.0243 s   ← chapter 12 (1 RTT)\ntls_handshake:   0.0491 s   ← chapter 13 (1 more RTT)\nttfb:            0.1122 s   ← edge + origin + DB (chapters 15-20)\ntotal:           0.1194 s' }
    ]
  },

  {
    id: 'http-arrives-edge',
    chapter: 14,
    title: 'Cloudflare decrypts: plaintext, for the first time since the laptop',
    node: 'anycast',
    mode: 'remote',
    state: { mode: 'remote' },
    packet: {
      label: 'Decrypted at the edge — HTTP/2 HEADERS visible again',
      layers: ['tls', 'http'],
      fields: {
        tls: { 'Status': 'record decrypted, GCM tag verified' },
        http: {
          ':method': 'GET',
          ':path': '/products?limit=20',
          ':authority': 'api.shop.dev',
          'Client IP (from TCP)': '203.0.113.77',
          'Stream': '1'
        }
      }
    },
    explain: {
      what: "The edge server's TLS terminator decrypts the record, verifies the GCM tag, and hands the HEADERS frame to Cloudflare's HTTP proxy (the Rust-based pingora/FL pipeline). For the first time since leaving the laptop's memory, the request exists as plaintext outside your machine. It now enters a gauntlet of edge logic: DDoS scoring, WAF rules, cache lookup, routing.",
      why: "TLS is end-to-end only between the endpoints that hold the keys - and here, that is Cloudflare, not the origin. That is the deal a CDN makes: you delegate your certificate so it can inspect, cache, filter, and optimize.",
      component: 'Cloudflare edge HTTP proxy (Pingora), post-TLS-termination',
      layer: 'Remote edge · OSI L7',
      abstraction: 'The trusted intermediary opens the pouch it was given keys for',
      misconception: '"HTTPS means only the origin can read my request" - it means only the holder of the presented certificate’s private key can. With a CDN, that is the CDN. End-to-end to the ORIGIN would require the CDN to be a pure TCP passthrough (Cloudflare Spectrum/SNI-routing), giving up every L7 feature.',
      analogy: 'A courier with a legitimate key to your diplomatic pouch: entirely intended, but the pouch is open in their sorting facility.',
      protocol: 'TLS termination + HTTP/2 frame processing',
      command: 'curl -sI https://api.shop.dev/products?limit=20 | grep -i "cf-ray\\|server"\n# server: cloudflare  ← you are talking to the edge, not the origin',
      production: 'Regulated workloads use Keyless SSL (private key stays on customer hardware, edge does RSA/ECDSA ops remotely) or Geo Key Manager to bound where keys and plaintext may exist. Both add latency; both exist because this step is a genuine trust boundary.'
    }
  },

  /* ══════════════ CHAPTER 15 — CLOUDFLARE EDGE ══════════════ */

  {
    id: 'cf-ddos-scoring',
    chapter: 15,
    title: 'DDoS: scored before anyone reads the path',
    node: 'ddos',
    mode: 'remote',
    explain: {
      what: "The first gate is volumetric and behavioral, not semantic. The edge scores this connection against per-IP and per-ASN rate baselines, checks the JA4 TLS fingerprint against the claimed User-Agent, weighs request cadence, and consults reputation for 203.0.113.77. Legitimate residential ISP address, browser-consistent fingerprint, first request on a new connection - score is benign, no challenge issued, packet forwarded to the next stage in microseconds.",
      why: "Attack traffic must die before it costs anything expensive. Cheap, early, statistical filtering means a terabit flood is absorbed by silicon and eBPF while real users pay no measurable latency. Anycast helps enormously: an attack from 100k bots lands on 300 PoPs, diluted by geography.",
      component: 'Cloudflare L3/L4 + L7 DDoS mitigation (XDP/eBPF drop paths, gatebot)',
      layer: 'Remote edge · L3-L7 filtering',
      abstraction: 'A bouncer who judges the crowd’s shape, not each person’s conversation',
      misconception: '"DDoS protection means a big firewall" - at scale it is statistical: sampled flow analysis generates rules that are compiled into eBPF/XDP and dropped in the NIC path, at line rate, before the packet ever reaches a socket.',
      analogy: 'Stadium turnstiles that count and pace the crowd rather than interviewing each fan.',
      protocol: 'Behavioral heuristics + JA3/JA4 TLS fingerprinting + reputation feeds',
      command: 'curl -sI https://api.shop.dev/products | grep -i "cf-ray\\|cf-mitigated"\n# on the origin side: watch for the absence of attack traffic entirely',
      production: 'Tune Security Level and Bot Fight Mode carefully - aggressive challenge modes break API clients and mobile apps that cannot solve JS challenges. Always exempt API paths with proper auth from interactive challenges.'
    },
    code: [
      { title: 'How attack traffic dies (conceptually)', lang: 'c', code: '/* XDP program on the NIC RX path — before any allocation */\nSEC("xdp")\nint drop_attack(struct xdp_md *ctx) {\n    /* parse eth/ip/tcp, hash 4-tuple */\n    if (bpf_map_lookup_elem(&blocklist, &src_ip))\n        return XDP_DROP;      /* ~40 Mpps per core */\n    if (rate_exceeded(&rl_map, src_ip))\n        return XDP_DROP;\n    return XDP_PASS;          /* our SYN took this branch */\n}' }
    ]
  },

  {
    id: 'cf-waf-rules',
    chapter: 15,
    title: 'WAF: reading the request with suspicion',
    node: 'waf',
    mode: 'remote',
    packet: {
      label: 'GET /products?limit=20 — under WAF inspection',
      layers: ['http'],
      fields: {
        http: {
          ':path': '/products?limit=20',
          'Query param': 'limit=20  → numeric, benign',
          'Managed ruleset': 'OWASP Core + Cloudflare Managed',
          'Checks': 'SQLi, XSS, RCE, path traversal, log4shell, header anomalies',
          'Verdict': 'no rule matched → allow'
        }
      }
    },
    explain: {
      what: "Now the plaintext is actually parsed. The WAF evaluates managed rulesets against URI path, query string, headers, cookies, and (for POSTs) body: SQL injection patterns (UNION SELECT, tautologies like ' OR 1=1), XSS payloads (<script, javascript: URIs), traversal (../../etc/passwd), template-injection and log4shell signatures, plus anomalies like duplicate Host headers or smuggling-shaped Content-Length/Transfer-Encoding pairs. limit=20 is a boring integer. Verdict: allow.",
      why: "A WAF buys time, not immunity: it blocks known exploit SHAPES so a vulnerable app is not compromised the day a CVE drops, before you can patch. It is compensating control, never a substitute for parameterized queries and output encoding.",
      component: 'Cloudflare WAF managed rules + custom rules engine (wirefilter expressions)',
      layer: 'Remote edge · OSI L7',
      abstraction: 'A pattern-matching customs officer inspecting the contents, not just the envelope',
      misconception: '"A WAF makes my app secure" - it pattern-matches; determined attackers encode, chunk, and fragment around signatures. Meanwhile false positives block real users: an innocent product description containing "select" has broken more sites than most WAFs have saved.',
      analogy: 'Airport security scanning for known dangerous shapes - excellent against the catalogued threats, blind to the novel ones.',
      protocol: 'OWASP CRS-derived signatures + Cloudflare Managed Rules',
      command: '# safely trigger a rule to prove it works:\ncurl -s "https://api.shop.dev/products?limit=20%27%20OR%201=1--" -o /dev/null -w "%{http_code}\\n"\n# 403 + a cf-ray you can look up in the Firewall Events log',
      production: 'Deploy new WAF rules in LOG mode first, review a week of matches, then enforce. Every WAF rollout that skipped this step generated a Sev-1 from false positives blocking checkout or admin flows.'
    },
    code: [
      { title: 'A custom rule (wirefilter syntax)', lang: 'bash', code: '# Cloudflare custom rule expression\n(http.request.uri.path contains "/admin" and ip.geoip.country ne "NL")\n  or (http.request.method eq "POST"\n      and http.request.uri.path eq "/products"\n      and not http.request.headers["content-type"][0]\n              contains "application/json")\n# action: block  |  log  |  managed_challenge' }
    ]
  },

  {
    id: 'cf-cache-lookup',
    chapter: 15,
    title: 'Cache lookup: MISS, and correctly so',
    node: 'cfcache',
    mode: 'remote',
    packet: {
      label: 'Cache key computed — no stored object',
      layers: ['http'],
      fields: {
        http: {
          'Cache key': 'https://api.shop.dev/products?limit=20',
          'Method': 'GET (cacheable in principle)',
          'Zone rule': 'Cache Level: Standard — /products* is dynamic',
          'Result': 'MISS',
          'cf-cache-status': 'DYNAMIC'
        }
      }
    },
    explain: {
      what: "The edge builds a cache key (scheme + host + path + query, plus any configured Vary/cookie/device dimensions) and probes the local NVMe cache tier. Nothing there. By default Cloudflare does not cache API responses at all - only static extensions - and this endpoint will return Cache-Control: private, no-store because product availability is per-user and volatile. Status: DYNAMIC/MISS. The request must go to the origin.",
      why: "Caching correctness beats caching aggressiveness. Serving one user's personalized cart to another is a catastrophic bug; a cache miss is merely slow. Cache-Control: private exists precisely to draw that line between shared and per-user caches.",
      component: 'Cloudflare edge cache (tiered: local PoP → regional upper tier)',
      layer: 'Remote edge · OSI L7',
      abstraction: 'A key-value store keyed by request identity, guarded by freshness and privacy rules',
      misconception: '"CDNs cache everything automatically" - by default they cache static assets by extension. Dynamic and API responses need explicit Cache Rules, and any Set-Cookie or Cache-Control: private/no-store makes an object uncacheable in a shared cache.',
      analogy: 'A librarian who checks the shelf, finds nothing, and must order from the central archive - and who refuses to shelve personalized documents at all.',
      protocol: 'HTTP caching (RFC 9111): Cache-Control, Vary, ETag, stale-while-revalidate',
      command: 'curl -sI https://api.shop.dev/products?limit=20 | grep -i "cf-cache-status\\|cache-control\\|age"\n# cf-cache-status: DYNAMIC\n# cache-control: private, no-store',
      production: 'For read-heavy APIs the big wins are Cache Rules with short TTLs plus stale-while-revalidate, and Tiered Cache so a miss hits a regional parent instead of the origin. Even a 10 s TTL collapses a thundering herd into one origin request per PoP.'
    },
    code: [
      { title: 'Cache status values worth knowing', lang: 'bash', code: 'HIT        served from edge cache\nMISS       not in cache, fetched from origin, now stored\nEXPIRED    was cached, TTL elapsed, revalidated\nSTALE      served expired while revalidating in background\nDYNAMIC    not eligible for caching  ← our /products call\nBYPASS     a rule or header forced origin\nREVALIDATED  origin returned 304 Not Modified' }
    ],
    prod: {
      title: 'Cache lookup for /tours',
      explain: { production: 'Island Tours tour listings change a few times a day, so /tours IS cached: a Cache Rule sets edge TTL 60 s with stale-while-revalidate=600, and Cloudflare Tiered Cache keeps origin load flat during traffic spikes. A purge-by-tag fires from the CMS whenever a tour is edited.' },
      code: [
        { title: 'Cache Rule + purge', lang: 'bash', code: '# Cache Rule: (http.host eq "api.islandtours.io" and\n#              starts_with(http.request.uri.path, "/tours"))\n#   → Cache eligible, Edge TTL 60s, Browser TTL 0\n\n$ curl -sI https://api.islandtours.io/tours | grep -i "cf-cache-status\\|age"\ncf-cache-status: HIT\nage: 23\n\n# CMS webhook purges by tag on edit:\n$ curl -X POST "$CF_API/zones/$ZONE/purge_cache" \\\n    -H "Authorization: Bearer $TOKEN" \\\n    -d \'{"tags":["tours"]}\'' }
      ]
    }
  },

  {
    id: 'cf-tls-trust-quiz',
    chapter: 15,
    title: 'Why can Cloudflare read your encrypted request at all?',
    node: 'cftls',
    mode: 'remote',
    quiz: {
      q: 'The request was end-to-end encrypted. So how is Cloudflare inspecting the path, headers, and cookies?',
      options: [
        'It brute-forces the session key at the edge',
        'TLS terminates AT the edge - Cloudflare holds the certificate and private key for api.shop.dev',
        'The origin forwards a decryption key to the edge for each request'
      ],
      answer: 1,
      explain: 'TLS is end-to-end between whoever holds the keys. Putting a site behind Cloudflare means delegating certificate/private-key custody (or using Keyless SSL), so the edge IS a legitimate TLS endpoint. It decrypts, inspects, and opens a SEPARATE TLS connection to the origin. Two connections, two encryptions, one plaintext gap at the edge.'
    },
    explain: {
      what: "Worth stating plainly: there is no single encrypted tunnel from browser to origin. There are two TLS sessions - browser↔edge and edge↔origin - joined by plaintext inside Cloudflare's memory. That is what makes WAF, caching, image optimization, Workers, and compression possible; none of it works on ciphertext. The pricing of that capability is trust.",
      why: "Engineers routinely reason about CDN architectures as if HTTPS reached the origin untouched, then are surprised that the edge can rewrite headers or serve cached bodies. Naming the trust boundary explicitly prevents whole classes of design and compliance mistakes.",
      component: 'Cloudflare TLS termination + origin-facing TLS initiator',
      layer: 'Remote edge · trust boundary',
      abstraction: 'A split-TLS proxy: two secure legs, one trusted middle',
      misconception: '"End-to-end encryption" applied to CDN-fronted HTTPS - it is HOP-to-hop encryption with a trusted intermediary. True E2E (like Signal) means the intermediary mathematically cannot read the content, which is the opposite of what a CDN is for.',
      analogy: 'A translator in a confidential meeting: both sides speak securely to the translator, and the translator understands everything.',
      protocol: 'TLS 1.3 client-facing + TLS 1.2/1.3 origin-facing (two independent sessions)',
      command: 'curl -sI https://api.shop.dev/products | grep -i "server\\|cf-ray"\nopenssl s_client -connect api.shop.dev:443 </dev/null 2>/dev/null | grep issuer\n# issuer is a Cloudflare CA, not your origin CA',
      production: 'Set SSL/TLS mode to Full (strict) so the edge validates the origin certificate - Flexible mode (plaintext to origin) is a still-common and indefensible misconfiguration. Authenticated Origin Pulls (mTLS) additionally prove to the origin that a request really came from Cloudflare.'
    }
  },

  {
    id: 'cf-origin-decision',
    chapter: 15,
    title: 'Routing to origin: which server, over which link',
    node: 'originpull',
    mode: 'remote',
    explain: {
      what: "Cache said miss, WAF said allow, so the edge resolves where the origin lives: the zone's DNS record for api.shop.dev is a proxied A record whose hidden origin address is 198.51.100.10. The edge picks an egress path - plain internet transit, or Argo Smart Routing over Cloudflare's own backbone if enabled - and hands the request to the origin-pull subsystem.",
      why: "This indirection is the CDN's core value: clients only ever learn the anycast IP. The real origin is unpublished, so attackers cannot bypass the edge to hit it directly - provided the origin firewall actually restricts inbound to Cloudflare ranges, which is the step teams forget.",
      component: 'Cloudflare origin resolution + Argo Smart Routing',
      layer: 'Remote edge · L7 routing',
      abstraction: 'A dispatcher choosing both the destination and the road to it',
      misconception: '"Being behind a CDN hides my origin" - only if you lock the origin down. Historical DNS records, certificate transparency logs, mail server IPs, and Shodan scans leak origins constantly. Allow inbound 443 ONLY from Cloudflare IP ranges (or use Tunnel).',
      analogy: 'A PO box service: the public sees the box number; only the service knows the house, and only if the house does not put its address on the mailbox.',
      protocol: 'Internal origin routing; optional Argo (Cloudflare backbone) vs public transit',
      command: 'curl -s https://api.cloudflare.com/client/v4/ips | jq -r ".result.ipv4_cidrs[]"\n# feed these into the origin firewall allowlist\ndig +short api.shop.dev    # only ever shows 104.18.x.x',
      production: 'Cloudflare Tunnel (cloudflared) removes inbound firewall holes entirely: the origin dials OUT and the edge routes into that tunnel. It is the modern answer to origin exposure and eliminates the allowlist maintenance problem.'
    }
  },

  {
    id: 'cf-connection-pool',
    chapter: 15,
    title: 'A second, completely separate TCP+TLS connection',
    node: 'originpull',
    mode: 'remote',
    packet: {
      label: 'Edge → origin: reusing a pooled keep-alive connection',
      layers: ['ip', 'tcp'],
      fields: {
        ip: { 'Src': '172.68.x.x  (Cloudflare egress)', 'Dst': '198.51.100.10', 'TTL': '64' },
        tcp: { 'Src Port': '44921', 'Dst Port': '443', 'Flags': 'PSH, ACK', 'State': 'ESTABLISHED (pooled, age 41 s)' }
      }
    },
    effects: ['pool+'],
    explain: {
      what: "The edge does NOT forward your packets. It makes its own request over its own connection: source is a Cloudflare egress IP, destination 198.51.100.10:443, fresh 4-tuple, separate TCP state machine, separate TLS session. Crucially it is usually POOLED - the edge keeps warm keep-alive connections to each origin, so this request skips both handshakes entirely and saves 2 RTTs (~80 ms on a transatlantic origin).",
      why: "Connection pooling at the edge is one of the largest and least visible CDN wins: even for 100% uncacheable traffic, amortizing TCP+TLS setup across thousands of requests removes handshake latency from every user's critical path.",
      component: 'Cloudflare origin connection pool (HTTP keep-alive / HTTP/2 to origin)',
      layer: 'Remote edge → origin · L4/L7',
      abstraction: 'A proxy is two connections wearing one trench coat',
      misconception: '"The proxy forwards my TCP connection" - it terminates yours and originates its own. Your sequence numbers, TLS session, and source IP all stop at the edge; the origin sees Cloudflare as the client, which is exactly why CF-Connecting-IP must exist.',
      analogy: 'A translator who does not relay your phone call but places their own call on a line they keep permanently open.',
      protocol: 'Origin-facing TCP + TLS with HTTP keep-alive (RFC 9112 §9.3)',
      command: '# on the origin, observe who is actually connected:\nss -tan state established "( sport = :443 )" | head\n# many long-lived connections from Cloudflare ranges, few per request',
      production: 'Tune origin keepalive_requests / keepalive_timeout to match: if the origin closes pooled connections aggressively, the edge re-handshakes constantly and TTFB rises. Mismatched idle timeouts also cause sporadic 502s from races on connection close.'
    },
    code: [
      { title: 'Two connections, one request', lang: 'bash', code: 'browser 192.168.1.23:51324 ──TLS#1──▶ 104.18.32.7:443   (edge)\n                                          │  plaintext here\n                                          ▼\n  edge 172.68.x.x:44921    ──TLS#2──▶ 198.51.100.10:443  (origin)\n\n# separate ISNs, separate cipher suites, separate certs,\n# separate congestion windows. Only the HTTP SEMANTICS cross.' }
    ]
  },

  {
    id: 'cf-headers-added',
    chapter: 15,
    title: 'CF-Connecting-IP and CF-Ray: the edge signs its work',
    node: 'originpull',
    mode: 'remote',
    packet: {
      label: 'Origin-bound request — headers augmented',
      layers: ['http'],
      fields: {
        http: {
          ':method': 'GET',
          ':path': '/products?limit=20',
          'Host': 'api.shop.dev  (preserved)',
          'CF-Connecting-IP': '203.0.113.77  ← the real client',
          'X-Forwarded-For': '203.0.113.77',
          'X-Forwarded-Proto': 'https',
          'CF-Ray': '8a1f2c9d4e7b0f23-AMS',
          'CF-IPCountry': 'NL',
          'Accept-Encoding': 'gzip, br'
        }
      }
    },
    explain: {
      what: "Because the origin will see Cloudflare's IP as the TCP peer, the edge injects the truth as headers: CF-Connecting-IP (the client address, 203.0.113.77 - the NAT'd public one, never the private 192.168.1.23), X-Forwarded-For, X-Forwarded-Proto: https, CF-IPCountry, and CF-Ray - a unique request ID whose suffix (AMS) names the PoP that handled it. That Ray ID is the join key between Cloudflare logs and your application logs.",
      why: "Every rate limiter, audit log, geo rule, and abuse-blocking feature downstream depends on knowing the real client IP. Without these headers a proxied app sees 100% of its traffic coming from a handful of edge addresses, and IP-based logic silently becomes nonsense.",
      component: 'Cloudflare header injection (edge → origin request rewriting)',
      layer: 'Remote edge · OSI L7',
      abstraction: 'Out-of-band provenance metadata added by a trusted forwarder',
      misconception: '"Trust X-Forwarded-For" - it is client-settable and trivially spoofed unless your proxy strips and re-sets it, and unless you only accept it from known-trusted upstream IPs. Behind Cloudflare, prefer CF-Connecting-IP AND restrict inbound to CF ranges; otherwise anyone can forge their apparent IP.',
      analogy: 'A forwarding service that staples a note to each envelope: "originally from this address, received at 14:02, reference #8a1f2c".',
      protocol: 'X-Forwarded-For (RFC 7239 Forwarded is the standardized successor)',
      command: 'curl -sI https://api.shop.dev/products | grep -i cf-ray\n# nginx side: real_ip_header CF-Connecting-IP;\n#             set_real_ip_from <cloudflare ranges>;',
      production: 'Always log CF-Ray in application logs. When a user reports an error, that single ID pivots instantly between Cloudflare Firewall Events, edge logs, and your own traces - it is the cheapest observability win in a CDN setup.'
    },
    code: [
      { title: 'Restoring the real client IP in nginx', lang: 'bash', code: '# /etc/nginx/conf.d/cloudflare-realip.conf\nset_real_ip_from 173.245.48.0/20;\nset_real_ip_from 103.21.244.0/22;\nset_real_ip_from 104.16.0.0/13;\n# ... full list: https://www.cloudflare.com/ips-v4\nreal_ip_header CF-Connecting-IP;\nreal_ip_recursive on;\n\n# now $remote_addr == 203.0.113.77 in logs and rate limits' }
    ]
  },

  /* ══════════════ CHAPTER 16 — TO THE ORIGIN ══════════════ */

  {
    id: 'origin-tls-second',
    chapter: 16,
    title: 'TLS #2: the edge authenticates the origin',
    node: 'originpull',
    mode: 'remote',
    packet: {
      label: 'Edge → origin request, encrypted on session #2',
      layers: ['ip', 'tcp', 'tls', 'http'],
      fields: {
        ip: { 'Src': '172.68.x.x', 'Dst': '198.51.100.10', 'TTL': '64' },
        tcp: { 'Src Port': '44921', 'Dst Port': '443', 'Flags': 'PSH, ACK' },
        tls: { 'Session': 'TLS 1.3, resumed via PSK ticket (0 handshake RTTs)', 'Mode': 'Full (strict): origin cert validated' },
        http: { ':path': '/products?limit=20', 'CF-Connecting-IP': '203.0.113.77' }
      }
    },
    explain: {
      what: "On the pooled connection the request is encrypted again, this time under the edge↔origin TLS session. In Full (strict) mode the edge validated the origin's certificate when the connection was created - typically a Cloudflare Origin CA cert (free, long-lived, trusted only by Cloudflare) or a normal public cert. If Authenticated Origin Pulls is on, the edge also presents a CLIENT certificate, so the origin can cryptographically verify the request came from Cloudflare and reject everything else.",
      why: "Without this leg, the CDN-to-origin hop crosses the public internet in plaintext - a gaping hole that Cloudflare's old 'Flexible' mode created for years of unsuspecting sites. And without mTLS, anyone who discovers the origin IP can impersonate the CDN.",
      component: 'Origin-facing TLS (Full strict + optional mTLS client cert)',
      layer: 'Edge → origin · OSI L6',
      abstraction: 'A second sealed pouch for the second leg of the relay',
      misconception: '"Flexible SSL still shows a padlock, so it is fine" - the padlock covers only browser↔edge; edge↔origin is cleartext across the internet. It is security theater and every audit flags it.',
      analogy: 'A courier who reseals the documents in a fresh pouch, with a different key, for the second half of the trip.',
      protocol: 'TLS 1.3 (RFC 8446), optional mutual TLS (RFC 8446 client auth)',
      command: 'openssl s_client -connect 198.51.100.10:443 -servername api.shop.dev </dev/null\n# with Authenticated Origin Pulls: fails without a CF client cert',
      production: 'nginx: ssl_client_certificate /etc/ssl/cloudflare-origin-pull-ca.pem; ssl_verify_client on; - now the origin serves NOTHING unless the request came through Cloudflare. Pair it with the IP allowlist for defense in depth.'
    }
  },

  {
    id: 'origin-backbone-transit',
    chapter: 16,
    title: 'Across the backbone to the origin datacenter',
    node: 'tier1b',
    from: 'originpull',
    mode: 'net',
    state: { mode: 'net' },
    packet: {
      label: 'Edge → origin — crossing carrier networks',
      layers: ['ip', 'tcp', 'tls'],
      fields: {
        ip: { 'Src': '172.68.x.x', 'Dst': '198.51.100.10', 'TTL': '64 → 58' },
        tcp: { 'Src Port': '44921', 'Dst Port': '443', 'Flags': 'PSH, ACK' },
        tls: { 'Record': 'application_data (session #2)' }
      }
    },
    explain: {
      what: "The origin lives in a datacenter that may be a city or a continent away from the PoP that took the user's request. The packet crosses either the public internet (transit + peering, the same BGP economics as before) or, with Argo Smart Routing, Cloudflare's private backbone using latency telemetry to dodge congested public paths. Budget: anywhere from 2 ms (same metro) to 80 ms (Amsterdam edge, Virginia origin).",
      why: "This hop is the part of the latency budget the CDN cannot cache away for dynamic requests. It is precisely why architectures move logic to the edge (Workers) or replicate data regionally - the origin round trip is the floor for anything uncacheable.",
      component: 'Public transit / peering, or Cloudflare Argo private backbone',
      layer: 'Internet · OSI L3',
      abstraction: 'The CDN’s own outbound journey, subject to the same physics as yours',
      misconception: '"A CDN makes everything fast" - it makes cacheable things fast and shortens the CLIENT’s handshake. A cache miss still pays edge→origin RTT on top; a badly placed origin can make CDN-fronted dynamic requests slower than direct.',
      analogy: 'The local branch not having the part in stock and couriering to the central warehouse - the customer waits for both legs.',
      protocol: 'IP/TCP/TLS over BGP-routed paths; Argo optimizes route selection',
      command: 'curl -w "ttfb:%{time_starttransfer}s\\n" -o /dev/null -s https://api.shop.dev/products\n# compare cached (HIT) vs uncached (DYNAMIC) TTFB to isolate this hop',
      production: 'Measure edge→origin latency per PoP; if users are global and the origin is single-region, that hop dominates p95. Fixes: regional origins, Argo, or moving read paths to edge compute with replicated data.'
    }
  },

  {
    id: 'origin-lb-l4',
    chapter: 16,
    title: 'Load balancer: one VIP, many backends',
    node: 'lb',
    mode: 'remote',
    state: { mode: 'remote' },
    packet: {
      label: 'Request at the origin VIP 198.51.100.10',
      layers: ['ip', 'tcp'],
      fields: {
        ip: { 'Src': '172.68.x.x', 'Dst': '198.51.100.10 (VIP)', 'TTL': '58' },
        tcp: { 'Src Port': '44921', 'Dst Port': '443', 'Flags': 'PSH, ACK', 'Backend chosen': '10.0.2.31:443 (consistent hash on 4-tuple)' }
      }
    },
    explain: {
      what: "198.51.100.10 is a virtual IP fronting a pool of proxy servers. An L4 load balancer (IPVS, or a cloud NLB) selects a backend by consistent hashing on the 4-tuple - or by least-connections - and forwards, typically via DSR or NAT. Consistency matters enormously: every packet of this TCP connection MUST reach the same backend, or the connection dies instantly with an RST since no other machine holds its TCP state.",
      why: "L4 balancing is stateless-ish, cheap, and blazingly fast (millions of pps) because it never parses HTTP. Consistent hashing means adding or removing a backend only reshuffles 1/N of flows instead of breaking everything - the same trick memcached and DHTs use.",
      component: 'L4 load balancer (IPVS/LVS, Maglev-style hashing, or cloud NLB)',
      layer: 'Origin datacenter · OSI L4',
      abstraction: 'A deterministic hash function pretending to be a single server',
      misconception: '"Load balancers distribute evenly" - they distribute by hash or connection count, which is not the same as by LOAD. One connection can carry a thousand expensive requests; least-connections and hashing are both blind to per-request cost.',
      analogy: 'A restaurant host seating parties by a fixed rule so the same waiter always serves the same table for the whole meal.',
      protocol: 'L4 forwarding (IPVS DR/NAT), Maglev consistent hashing',
      command: 'ipvsadm -Ln                    # virtual services and real servers\nipvsadm -Lnc | head            # active connection table\nss -tan state established dst 172.68.0.0/16 | wc -l',
      production: 'Health checks are the whole game: too aggressive and a GC pause ejects a healthy backend, too lax and users hit a dead one for 30 s. Use fast checks with multiple-failure thresholds, plus connection draining on deploy so in-flight requests finish.'
    },
    code: [
      { title: 'IPVS backend pool', lang: 'bash', code: '$ ipvsadm -Ln\nIP Virtual Server version 1.2.1 (size=4096)\nProt LocalAddress:Port Scheduler Flags\n  -> RemoteAddress:Port   Forward Weight ActiveConn InActConn\nTCP  198.51.100.10:443 mh (mh-port)\n  -> 10.0.2.31:443       Route   1      1842       210\n  -> 10.0.2.32:443       Route   1      1799       198\n  -> 10.0.2.33:443       Route   1      1863       221\n# scheduler "mh" = Maglev hashing: stable flow→backend mapping' }
    ]
  },

  {
    id: 'origin-proxy-recv',
    chapter: 16,
    title: 'nginx accepts, terminates TLS #2, parses HTTP',
    node: 'proxy',
    mode: 'remote',
    packet: {
      label: 'Plaintext HTTP inside the origin',
      layers: ['http'],
      fields: {
        http: {
          'Request': 'GET /products?limit=20 HTTP/2',
          'Host': 'api.shop.dev',
          'CF-Connecting-IP': '203.0.113.77',
          'X-Forwarded-For': '203.0.113.77',
          'X-Forwarded-Proto': 'https',
          'CF-Ray': '8a1f2c9d4e7b0f23-AMS'
        }
      }
    },
    explain: {
      what: "nginx on backend 10.0.2.31 accepts the connection, terminates the second TLS session, and parses the HTTP request. A server block matching api.shop.dev routes it to a location with proxy_pass. nginx appends the upstream address to X-Forwarded-For, preserves the original Host header, sets X-Real-IP from CF-Connecting-IP - and, importantly, does NOT re-encrypt: the next hop is over the datacenter's internal network.",
      why: "A reverse proxy earns its place doing what app servers do badly: TLS termination at scale, static file serving, request buffering to shield slow clients from workers, rate limiting, and clean routing across many upstreams on one port 443.",
      component: 'nginx reverse proxy (ngx_http_proxy_module)',
      layer: 'Origin server · OSI L7',
      abstraction: 'A traffic director that speaks the internet outside and simple HTTP inside',
      misconception: '"nginx forwards the request unchanged" - it rewrites hop-by-hop headers, may buffer the whole body, normalizes the path, and by default downgrades to HTTP/1.1 upstream. Header handling bugs here (Host, X-Forwarded-Proto) cause the classic "redirect loop behind a proxy" and wrong absolute URLs.',
      analogy: 'A building receptionist who signs for all deliveries, checks IDs at the door, and walks parcels to the right internal office.',
      protocol: 'HTTP/2 or HTTP/1.1 inbound; HTTP/1.1 to upstream by default',
      command: 'nginx -T | grep -A12 "server_name api.shop.dev"\ntail -f /var/log/nginx/access.log\nss -tanp | grep nginx | head',
      production: 'proxy_buffering on protects slow upstreams from slow clients but breaks SSE/streaming - turn it off per-location for those. Watch upstream_response_time in the access log format; it cleanly separates "app is slow" from "network is slow".'
    },
    code: [
      { title: '/etc/nginx/conf.d/api.conf', lang: 'bash', code: 'server {\n    listen 443 ssl http2;\n    server_name api.shop.dev;\n\n    ssl_certificate     /etc/ssl/cf-origin.pem;\n    ssl_certificate_key /etc/ssl/cf-origin.key;\n    # Authenticated Origin Pulls:\n    ssl_client_certificate /etc/ssl/cloudflare-origin-pull-ca.pem;\n    ssl_verify_client on;\n\n    location / {\n        proxy_pass http://127.0.0.1:3000;\n        proxy_http_version 1.1;\n        proxy_set_header Host              $host;\n        proxy_set_header X-Real-IP         $remote_addr;\n        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;\n        proxy_set_header X-Forwarded-Proto $scheme;\n        proxy_read_timeout 30s;\n    }\n}' }
    ],
    prod: {
      title: 'Caddy accepts, terminates TLS, reverse-proxies',
      explain: { production: 'Island Tours runs Caddy instead of nginx: automatic HTTPS via ACME (no cert renewal cron, no expiry pages), HTTP/2 and HTTP/3 on by default, and reverse_proxy that sets X-Forwarded-For/Proto without being asked. The entire config for this service is five lines of Caddyfile.' },
      code: [
        { title: '/etc/caddy/Caddyfile', lang: 'bash', code: 'api.islandtours.io {\n    # certificates obtained + renewed automatically via ACME\n    encode zstd gzip\n\n    reverse_proxy 127.0.0.1:3000 {\n        header_up X-Real-IP {http.request.header.CF-Connecting-IP}\n        health_uri /healthz\n        health_interval 10s\n    }\n\n    log {\n        output file /var/log/caddy/api.log\n        format json\n    }\n}\n# X-Forwarded-For / -Proto / -Host are set by reverse_proxy by default' }
      ]
    }
  },

  {
    id: 'origin-tls-terminated',
    chapter: 16,
    title: 'Plaintext again — the last encryption boundary',
    node: 'proxy',
    mode: 'remote',
    explain: {
      what: "TLS session #2 ends here. From nginx onward - to the Docker bridge, into the container, through NestJS, down to PostgreSQL - the request travels as plaintext HTTP over loopback and private datacenter networks. That is a deliberate trade: TLS between processes on the same host would cost CPU for a threat model where an attacker with host access has already won.",
      why: "Knowing exactly where plaintext exists is a security architecture skill: browser memory, Cloudflare edge memory, origin proxy memory, and everything inside the datacenter perimeter. Compliance regimes (PCI, HIPAA) and zero-trust designs push encryption further inward - mTLS between services via a service mesh - precisely because perimeters get breached.",
      component: 'nginx TLS termination boundary → cleartext upstream',
      layer: 'Origin server · trust boundary',
      abstraction: 'The last envelope comes off; from here it is an internal memo',
      misconception: '"Internal traffic does not need encryption" - traditional perimeter thinking. Zero-trust assumes the network is hostile and encrypts service-to-service anyway (Istio/Linkerd mTLS, or WireGuard between hosts). Whether you need it is a threat-model decision, not a default.',
      analogy: 'Documents cleared through security at the building entrance, then hand-carried openly between offices inside.',
      protocol: 'Plain HTTP/1.1 over loopback or private VLAN',
      command: 'tcpdump -ni lo -A "tcp port 3000" | head -20   # fully readable\nss -tanp "( dport = :3000 )" | head',
      production: 'Service meshes automate internal mTLS with certificate rotation, at the cost of a sidecar per pod and real latency. Many teams start with TLS at the edge plus network policy, and add mesh mTLS only when compliance or multi-tenancy demands it.'
    },
    code: [
      { title: 'Where plaintext lives', lang: 'bash', code: 'browser memory            plaintext  ← your JS built it\n  ↓ TLS #1 (browser ↔ Cloudflare edge)\nCloudflare edge memory    plaintext  ← WAF, cache, Workers\n  ↓ TLS #2 (edge ↔ origin)\nnginx / Caddy memory      plaintext  ← proxy logic\n  ↓ HTTP over loopback / docker0\nNestJS process            plaintext  ← chapter 18\n  ↓ (optionally TLS)\nPostgreSQL                plaintext  ← chapter 20' }
    ]
  },

  {
    id: 'origin-upstream-handoff',
    chapter: 16,
    title: 'proxy_pass: handing off to the application',
    node: 'proxy',
    mode: 'remote',
    packet: {
      label: 'Upstream request — plain HTTP/1.1 to 127.0.0.1:3000',
      layers: ['tcp', 'http'],
      fields: {
        tcp: { 'Src': '127.0.0.1:41556', 'Dst': '127.0.0.1:3000', 'Note': 'loopback (or docker0 → 172.17.0.2:3000)' },
        http: {
          'Request': 'GET /products?limit=20 HTTP/1.1',
          'Host': 'api.shop.dev',
          'X-Forwarded-For': '203.0.113.77',
          'X-Forwarded-Proto': 'https',
          'X-Real-IP': '203.0.113.77',
          'Connection': 'keep-alive'
        }
      }
    },
    explain: {
      what: "nginx opens (or reuses from its upstream keepalive pool) a connection to 127.0.0.1:3000 and writes a plain HTTP/1.1 request. The published container port means this actually lands in a DNAT rule that rewrites the destination to 172.17.0.2:3000 inside the Docker bridge network - the subject of the very next chapter. Note the protocol downgrade: HTTP/2 outside, HTTP/1.1 upstream, because HTTP/2 buys nothing over a 0.1 ms loopback link.",
      why: "This handoff is the seam between infrastructure and application. Everything before it was moving bytes; everything after it is business logic. It is also where most 502s are born - upstream refused, upstream timed out, upstream sent an invalid header.",
      component: 'nginx upstream connection (proxy_pass to 127.0.0.1:3000)',
      layer: 'Origin server · OSI L7',
      abstraction: 'The reception desk finally walking the request to the person who does the work',
      misconception: '"nginx and the app are one system" - they are separate processes with separate lifecycles. nginx returning 502 means it could not talk to the app; 504 means the app did not answer in time. Reading that distinction correctly saves hours per incident.',
      analogy: 'The receptionist walking the signed-for parcel down the hall and placing it on the right desk.',
      protocol: 'HTTP/1.1 keep-alive to upstream (RFC 9112)',
      command: 'curl -s localhost:3000/products?limit=20 | head   # bypass the proxy entirely\njournalctl -u nginx -f | grep -E "upstream|502|504"',
      production: 'Set upstream keepalive (keepalive 64; + proxy_http_version 1.1; + proxy_set_header Connection "";) or nginx opens a fresh TCP connection per request to the app - a measurable throughput loss and a source of TIME_WAIT exhaustion under load.'
    },
    code: [
      { title: 'Upstream keepalive done right', lang: 'bash', code: 'upstream app {\n    server 127.0.0.1:3000;\n    keepalive 64;               # persistent connections to the app\n    keepalive_requests 1000;\n    keepalive_timeout 60s;\n}\n\nlocation / {\n    proxy_pass http://app;\n    proxy_http_version 1.1;     # required for keepalive\n    proxy_set_header Connection "";   # strip "close"\n}' }
    ]
  }

];
