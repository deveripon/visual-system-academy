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
      what: "Your laptop's CPU has done everything it can for this packet, and now it presses a button to tell the network card that a parcel is waiting. Concretely: the driver has filled in a TX descriptor — a small index card holding the packet's physical address in memory, its length, and flags for work the card should do itself. Then comes the last thing any CPU instruction ever does with this packet: a single 4-byte write of the new tail index into the card's doorbell register, writel(i, tx_ring->tail). That uncached write crosses the PCIe bus and tells the silicon that work is waiting.",
      why: "The network card is an independent little computer with its own firmware, and without a doorbell it would have to keep checking memory forever just in case. The doorbell flips that around: the hardware sleeps until software taps it, and your CPU gets on with running your code.",
      component: 'NIC driver TX ring (drivers/net/ethernet/intel/igb/igb_main.c)',
      layer: 'Kernel/hardware boundary · OSI L2',
      abstraction: 'A producer/consumer ring: software bumps the tail, hardware chases it with the head',
      misconception: "You might think the kernel pushes the packet out onto the wire — actually it never does. The last CPU instruction involved writes one number into a register; everything after that is dedicated silicon doing the work.",
      analogy: "You clip the order ticket to the kitchen rail and ding the bell. The chef takes it from there — you, the waiter, walk away and serve another table.",
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
      what: "The network card does not wait to be handed the packet — it reaches into the laptop's memory and takes it. Its DMA engine (Direct Memory Access: hardware that reads memory without asking the CPU) wakes up, fetches the descriptor at the head index, and issues PCIe read requests for the frame bytes at the physical address the driver mapped with dma_map_single(). All 74 bytes stream out of RAM into the card's transmit FIFO with no copy loop, no CPU involvement and no cache pollution. If an IOMMU is switched on, it translates and validates every bus address on the way past.",
      why: "Copying packets with the CPU would burn entire cores at 10-gigabit speeds — a core can barely memcpy 10-20 GB/s while doing nothing else. Letting the device fetch its own data is the only reason modern network speeds are possible at all.",
      component: 'NIC DMA engine + PCIe root complex + IOMMU (intel_iommu/AMD-Vi)',
      layer: 'Hardware · below OSI, bus level',
      abstraction: 'Devices as first-class citizens of the memory bus - "here is an address, go read it yourself"',
      misconception: "You might think DMA is a clever kernel feature — actually it is a hardware ability called bus mastering. The kernel only sets up the address mapping and grants permission through the IOMMU; the device does all the reading itself.",
      analogy: "Instead of dictating a letter word by word to the courier, you hand over the key to the filing cabinet and say \"third folder\". They fetch it while you carry on working.",
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
        'No - the network card fills the checksum in AFTER tcpdump got to look',
        'Yes - the router will drop it and force a retransmit'
      ],
      answer: 1,
      explain: "tcpdump watches packets inside the kernel, before they ever reach the card. With transmit checksum offload switched on, the kernel deliberately leaves the field half-finished (CHECKSUM_PARTIAL) and the card computes the real sum as the bytes stream out. On the wire, the checksum is perfectly correct."
    },
    explain: {
      what: "As the bytes leave the card, a small circuit does the arithmetic homework the kernel deliberately skipped. The MAC block clocks the frame out of the FIFO bit by bit, and checksum engines fill in the blanks: the kernel marked this buffer CHECKSUM_PARTIAL, meaning \"I left the checksum unfinished on purpose\", so hardware computes the real TCP checksum (the kernel only seeded the pseudo-header sum) and the IP header checksum, patching both into the outgoing byte stream on the fly.",
      why: "A checksum has to touch every single byte — precisely the dull, repetitive work you want a dedicated circuit doing instead of a CPU that could be running your code. Offloading it has been standard practice for decades, and it is why captures taken on your own machine famously show \"incorrect\" checksums.",
      component: 'NIC MAC + checksum offload engine (ethtool -k: tx-checksumming)',
      layer: 'Hardware · OSI L2 (with an L3/L4 assist)',
      abstraction: 'The kernel emits a promise ("checksum goes at offset X"); silicon keeps it',
      misconception: "You might think an \"incorrect\" checksum in tcpdump on your own machine means corrupted packets — actually it means offload: you are watching the packet before the card has filled the number in. Real corruption shows up at the RECEIVER as checksum errors and drops, never at the sender.",
      analogy: "A parcel that leaves the depot with its weight label blank, because a scale built into the conveyor prints the label as the box rolls past.",
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
        { value: 'ethernet', label: 'Wired Ethernet (1000BASE-T)', hint: 'A Cat6 cable straight to the router: its own private wire, both directions at once, nobody to compete with. The frame just goes.' },
        { value: 'wifi', label: 'Wi-Fi (802.11ax, 5 GHz)', hint: 'Shared airwaves: wait your turn, get an acknowledgement for every frame, encrypt the hop with WPA3, and carry three MAC addresses instead of two.' }
      ]
    },
    explain: {
      what: "From here the packet's life depends on one very ordinary question: is there a cable plugged into your laptop or not? Everything above layer 2 is identical either way — the same IP header, the same TCP SYN. But layer 1 and the layer-2 framing diverge completely: either a point-to-point electrical link on a private wire, or a shared radio band where every device competes for airtime and every frame has to be acknowledged.",
      why: "This is the cleanest view you will ever get of layering actually working: TCP genuinely does not know or care whether its bytes traveled as voltage on copper or as 5 GHz microwaves through your kitchen wall.",
      component: 'NIC PHY selection: 1000BASE-T copper MAC/PHY vs 802.11ax radio + firmware',
      layer: 'Hardware · OSI L1/L2 fork',
      abstraction: 'Same postcard, different postal system',
      misconception: "You might think Wi-Fi is basically Ethernet without the cable — actually the 802.11 rules are far more elaborate: contention windows, retransmissions, an acknowledgement for every single frame, three or four address fields, and link-layer encryption. Ethernet has none of that.",
      analogy: "A private intercom line to the room next door, versus calling across a busy cafe: the same sentence works in both, but the cafe needs turn-taking and a \"got it!\" shouted back.",
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
      what: "Before the frame goes out, the card wraps it in bookends: a warm-up rattle at the front and a tamper check at the back. On the wire that means 7 preamble bytes of alternating 1s and 0s so the receiver's clock can lock on, a Start Frame Delimiter marking byte zero, then destination MAC a4:91:b1:0c:44:e2, source MAC 3c:07:54:6a:2b:91, EtherType 0x0800 announcing IPv4 inside, the 60-byte IP and TCP payload, and a trailing CRC-32 Frame Check Sequence. After the last bit the transmitter must stay silent for a 96-bit-time interframe gap.",
      why: "Two devices' clocks are never perfectly in step, so the receiver uses that known 1010... pattern to lock onto the sender's rhythm before real data arrives — and the check sequence at the end lets it spot corruption and silently drop the frame, missing barely one bad frame in four billion.",
      component: 'Ethernet MAC framing (IEEE 802.3 clause 3)',
      layer: 'Hardware · OSI L2',
      abstraction: 'An envelope with a synchronization rattle at the front and a tamper seal at the back',
      misconception: "You might think the 64-byte minimum frame size comes from some header arithmetic — actually it is a fossil from 10 Mb/s shared-cable Ethernet: a frame had to still be transmitting when a collision at the far end of the cable echoed back. Full-duplex links kept the rule anyway.",
      analogy: "A parcel with a strip of bubble wrap at the front so the scanner can find the leading edge, and a tamper-evident seal at the back so the recipient knows nothing was opened on the way.",
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
      what: "Here the 1s and 0s stop being numbers and become actual voltages wiggling on copper. The 1000BASE-T PHY — the chip that drives the physical wire — encodes the byte stream as PAM-5 symbols, five voltage levels (-2, -1, 0, +1, +2), sent on all four twisted pairs at once at 125 megasymbols per second each. Both ends transmit on the same pairs at the same time, and DSP echo cancellation subtracts your own signal so you can hear the other side. The bits are scrambled too, so the signal's energy stays evenly spread whatever the data looks like.",
      why: "Gigabit over 100 m of cheap copper is a signal-processing achievement rather than a wiring one: 2 bits per symbol, per pair, times 4 pairs, times 125 MBd equals 1 Gb/s — all squeezed inside the modest bandwidth Cat5e was ever designed to carry. PAM-5's fifth level pays for the forward error correction.",
      component: 'Ethernet PHY chip (accessed via MDIO; drivers/net/phy/)',
      layer: 'Hardware · OSI L1',
      abstraction: 'A modem for copper: digital bits in, analog waveform out',
      misconception: "You might think Ethernet sends a 1 as high voltage and a 0 as low — actually that died with 10BASE-T. Gigabit uses five-level symbols on four pairs in both directions simultaneously, with each end canceling its own echo. There is no single wire you could put a scope on and read bits off.",
      analogy: "Four people talking in both directions at once in the same small room, each subtracting the sound of their own voice so they can make out their partner's.",
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
      what: "The signal now sprints down the cable — fast, but not infinitely fast. The waveform travels at roughly two-thirds the speed of light, about 5 ns per meter, set by the cable's insulation (its velocity factor). Over a 15 m run to the router that is around 75 ns of flight. Pushing the 94 on-wire bytes out at 1 Gb/s took about 752 ns, so on a short link getting the bits out of the door takes far longer than their journey.",
      why: "This is the physics floor under every latency number you will ever measure. Nothing anyone engineers beats propagation delay, which is exactly why CDNs move servers closer instead of trying to make light hurry.",
      component: 'Cat6 UTP cable (the humblest component in the whole stack)',
      layer: 'Physics · OSI L1',
      abstraction: 'Information as a traveling electromagnetic wave guided by copper',
      misconception: "You might think electricity travels at the speed of light — actually the signal (the electromagnetic field, not the electrons, which drift along at centimeters per second) moves at 60-70% of c in a cable. Fiber is about the same, roughly 68%: glass does not beat copper on speed, it beats it on distance and bandwidth.",
      analogy: "A wave going round a stadium crowd: nobody runs anywhere, yet the wave crosses the whole stand in seconds.",
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
      what: "Over Wi-Fi the same packet is rebuilt with three return addresses instead of two, because it is about to be relayed. In the 802.11 Data frame, Addr1 is who should receive this transmission (the access point, a4:91:b1:0c:44:e2), Addr2 is who is transmitting it (the laptop, 3c:07:54:6a:2b:91), and Addr3 is the final layer-2 destination the AP should deliver to. In our house the AP and the router are the same box, so Addr1 and Addr3 happen to match. A fourth address slot exists for mesh and bridging setups.",
      why: "On a wired LAN the medium is the path. Over the air every frame goes via the access point, so \"who am I handing this to\" and \"who is it ultimately for\" become genuinely different questions needing different answers. The Duration field additionally reserves airtime so other stations hold off — a kind of virtual carrier sense called the NAV.",
      component: '802.11 MAC layer (mac80211 subsystem + NIC firmware)',
      layer: 'Hardware/firmware · OSI L2',
      abstraction: 'A courier slip with separate "hand to" and "deliver to" lines',
      misconception: "You might think Wi-Fi frames are Ethernet frames with a radio header bolted on — actually the 802.11 header is a completely different format: up to four addresses, sequence control, duration, QoS tags. The access point translates between the two formats for every single packet it relays.",
      analogy: "You hand a parcel to the hotel front desk (Addr1), signed by you (Addr2), addressed to the guest in room 12 (Addr3).",
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
      what: "Before the frame hits the air it is locked — but only for the few meters between you and the router. The frame body, meaning our entire IP packet, is encrypted with AES-CCMP using the pairwise key derived when the laptop joined the network: under WPA3 that key comes from the SAE handshake, built so that capturing it does not let an attacker guess your password offline. A packet number in the CCMP header blocks replays and an 8-byte MIC proves the frame was not altered. The 802.11 header itself stays readable, because radios need the addresses.",
      why: "Radio is a broadcast medium — everyone in range hears every frame — so without link encryption your neighbor would read your traffic like a newspaper. But it protects exactly one hop: the access point unwraps everything. End-to-end privacy is TLS's job, four chapters from now.",
      component: 'WPA3-Personal: SAE key exchange + AES-CCMP per-frame cipher (hostapd/wpa_supplicant)',
      layer: 'Link layer security · OSI L2',
      abstraction: 'An armored van between your house and the post office - not an armored envelope',
      misconception: "You might think being on WPA3 means your traffic is encrypted — actually it is encrypted only across the air gap. The router, your ISP and every backbone hop beyond see whatever TLS does or does not hide. Wi-Fi encryption and HTTPS solve different problems at different layers.",
      analogy: "A soundproof booth at the ticket window: nobody in the queue behind you hears a word, but the clerk hears everything and repeats your request down the line.",
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
      what: "The radio cannot simply talk — it has to wait for a gap in the conversation, and then wait a little longer at random. It listens until the 5 GHz channel has been idle for a DIFS interval, counts down a random backoff drawn from its contention window while the channel stays clear, and only then transmits. And unlike Ethernet, every unicast frame must be answered: the access point sends an ACK after a SIFS gap. No ACK before the timeout and the radio assumes a collision, doubles the contention window and tries again, typically up to 7 times.",
      why: "A radio cannot hear a collision while it is transmitting — its own signal deafens it at the antenna — so Ethernet's collision DETECTION is physically impossible here. Wi-Fi has to avoid collisions and confirm every delivery instead, and that machinery is why Wi-Fi latency is jittery by nature.",
      component: '802.11 DCF/EDCA channel access (NIC firmware real-time logic)',
      layer: 'MAC sublayer · OSI L2',
      abstraction: 'Distributed turn-taking with randomized politeness and mandatory "got it!"',
      misconception: "You might think Wi-Fi packet loss means a weak signal — actually it is often just crowding: thirty devices on one channel can spend more airtime backing off and retrying than transmitting. Those silent link-layer retries also hide the loss from TCP, which sees mysterious latency spikes instead.",
      analogy: "A dinner party with nobody chairing it: wait for a lull, count a random beat in your head, speak — and if nobody says \"mm-hm\", say it again.",
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
      what: "The frame leaves as microwaves — not on one radio tone but spread across about a thousand of them at once. Those are OFDM subcarriers, packed inside an 80 MHz channel at 5.18 GHz, each carrying a few bits as the amplitude and phase of a 256-QAM constellation point. The whole encrypted SYN frame occupies the air for a few tens of microseconds. The AP's radio demodulates it, checks the FCS, sends the ACK, decrypts the CCMP — and re-emits our packet as an ordinary wired Ethernet frame into its internal switch.",
      why: "Splitting one hostile wide channel into a thousand slow, narrow, individually correctable ones is the trick that lets hundreds of megabits survive the echoes bouncing off your walls and furniture. 2.4 GHz gets through walls better but is a crowded three-channel slum; 5 GHz offers many wide, cleaner channels at shorter range.",
      component: '802.11ax PHY (radio DSP + RF front end)',
      layer: 'Physics · OSI L1',
      abstraction: 'A thousand tiny parallel radio stations cooperating to carry one frame',
      misconception: "You might think 5 GHz is faster because a higher frequency means a faster signal — actually all radio waves travel at c. 5 GHz wins on channel WIDTH and on being less crowded, and it actually loses on range and on getting through walls.",
      analogy: "Instead of one auctioneer speed-talking, a choir of a thousand singers each holding one slow note. The chord is the message.",
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
      what: "The switch already knows which socket the router is plugged into, so it sends the frame down exactly one wire. In a home router this \"switch\" is a chip inside the same box. It reads the destination MAC a4:91:b1:0c:44:e2, finds it in its CAM table (the forwarding database), and sends the frame out that single port. At the same moment it LEARNS: source MAC 3c:07:54:6a:2b:91 was seen arriving on port 3, noted for the reply that will come back later. Store-and-forward switches also re-check the frame's CRC and quietly drop corrupt ones.",
      why: "Learning who lives where, and then only sending to them, is what turned Ethernet from a shared party line into millions of private point-to-point links. Only frames for unknown destinations, broadcasts and multicasts get flooded everywhere; everything else takes one correct path at line rate.",
      component: 'L2 switching ASIC with CAM (content-addressable memory) forwarding table',
      layer: 'Network gear · OSI L2',
      abstraction: 'A mail sorter who memorizes which desk every name sits at by watching return addresses',
      misconception: "You might think switches shout everything to every port and let each network card ignore what is not addressed to it — actually that was a HUB. A switch floods only while it has not yet learned which port a destination sits on; after that, traffic goes to exactly one port.",
      analogy: "A receptionist who stops using the PA system once she knows your office number, and who learns everyone's number simply by noticing which door they walk out of.",
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
      what: "The router sees its own name on the envelope, opens it, and throws the envelope away. Its LAN interface notices the destination MAC is its own address, so it accepts the frame instead of ignoring it. The Ethernet header has now finished its entire job — carrying this packet exactly one hop — and is discarded, check sequence and all. What travels up into the router's forwarding path is the bare IP packet, and the frame that leaves on the next hop will be a brand new one.",
      why: "This is the moment two different scopes visibly separate: MAC addresses are neighborhood-only and die at every router, while IP addresses are end-to-end and survive the whole trip. Fifteen routers from now, this IP header will still be recognizably ours.",
      component: 'Router ingress path (NIC MAC filter → ip_rcv() in a Linux-based router)',
      layer: 'Network gear · OSI L2→L3 handoff',
      abstraction: 'Envelopes are hop-scoped; the letter is end-to-end',
      misconception: "You might think your MAC address travels across the internet with your packet — actually MACs never leave the local link. Every router strips the old layer-2 header and writes a fresh one for the next link, so a capture taken on any backbone link shows that link's MACs, never yours.",
      analogy: "A relay race: the baton goes the whole distance, while each runner covers exactly one leg and then stops.",
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
      explain: "Forwarding picks the most specific entry in the routing table that matches. 104.18.32.7 is not inside 192.168.1.0/24 and matches no other entry, so the only thing left is 0.0.0.0/0 - the default route out of the WAN port. DNS did its job minutes ago and has nothing to do with forwarding."
    },
    explain: {
      what: "The router checks its short list of known destinations, does not find 104.18.32.7, and sends the packet to the one place that might know: the ISP. Its forwarding table lookup shows the address is not inside 192.168.1.0/24, the directly connected home network, and matches no other entry — so it falls through to 0.0.0.0/0, the default route out of the WAN port toward the ISP's gateway. Longest prefix wins: a /24 would beat the /0 if one matched, but nothing does. Decision: forward via WAN.",
      why: "The whole internet works because no router needs to know everywhere — it only needs SOME matching entry, plus a catch-all for the rest. Your home router knows three routes and a backbone router knows about a million, using exactly the same algorithm.",
      component: 'FIB / routing table lookup (Linux: fib_lookup(), LPM trie)',
      layer: 'Network gear · OSI L3',
      abstraction: 'A decision tree where the most specific rule that matches wins',
      misconception: "You might think the router asks DNS, or some central authority, where to send each packet — actually forwarding is a purely local table lookup that takes microseconds and asks nobody anything. How that table gets filled in the first place (static entries, DHCP, BGP) is a separate and far slower business.",
      analogy: "Office mail sorting: pigeonholes for the departments you know, and one big tray labeled \"everything else, take it to the main post office\".",
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
      what: "Every router a packet passes ticks a counter down by one, and here it goes from 64 to 63. That counter is the IP TTL — named Time To Live, but really a hop budget. The router also patches the header checksum incrementally, using the RFC 1624 trick for fixing a checksum after one field changes rather than re-adding the whole header. Had the TTL reached 0, the packet would have been dropped and an ICMP Time Exceeded message sent back to 192.168.1.23 — precisely the behavior traceroute weaponizes by sending deliberately tiny TTLs.",
      why: "TTL is the internet's loop insurance: one bad routing table could otherwise send a packet round in circles forever, melting a link. A finite hop budget guarantees every packet eventually dies somewhere — and as a bonus, the TTL you receive hints at how far a packet traveled.",
      component: 'IP forwarding path (ip_forward() → ip_decrease_ttl())',
      layer: 'Network gear · OSI L3',
      abstraction: 'A bus ticket with 64 punch holes - one punched per transfer',
      misconception: "You might think TTL is a countdown in seconds — actually RFC 791 did say seconds, but the world standardized on hops decades ago. Nothing measures wall-clock time; every router simply subtracts one.",
      analogy: "Pass-the-parcel with a rule that the parcel is thrown out after 64 passes, so a parcel with the wrong name on it cannot go round the circle forever.",
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
      what: "The packet reaches the front door of the house still wearing an address that only means something indoors. At netfilter's POSTROUTING hook it still carries source 192.168.1.23:51324, and that source is a death sentence out on the public internet: 192.168.0.0/16 is RFC 1918 private space, so no backbone router will carry a reply toward it — millions of homes use the very same numbers. Conntrack, the router's connection ledger, has already written down this flow's original details: (192.168.1.23, 51324) to (104.18.32.7, 443), TCP, state NEW.",
      why: "IPv4 has about 3.7 billion usable addresses for something like 20 billion devices, so whole households share one public number. The ledger entry written here is the only reason the reply will be able to find its way back to your laptop.",
      component: 'netfilter conntrack + nat table, POSTROUTING chain',
      layer: 'Router kernel · OSI L3/L4',
      abstraction: 'An outbound border checkpoint that must issue you public papers before you exit',
      misconception: "You might think NAT is a firewall — actually it drops unsolicited inbound traffic only because there is no matching entry in its ledger, not because anyone wrote a policy. Real firewalling is a separate set of rules, and this side effect is exactly what breaks peer-to-peer apps, hence STUN and TURN.",
      analogy: "Your desk extension x51324 cannot take calls from outside the company; the switchboard has to give you an outside line first.",
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
      what: "Your home router quietly swaps the return address on the envelope: inside the house you are 192.168.1.23, but out on the internet the whole household shares one public address, 203.0.113.77. The masquerade rule also picks a free source port, 38112, so this conversation stays unique among every device in the house, and notes \"port 38112 on the outside = 192.168.1.23:51324 on the inside\" in its address book, the conntrack table. Then it fixes the two checksums it just invalidated — the TCP one included, because that checksum covers a pseudo-header containing the IP addresses.",
      why: "Port translation is what lets a single public address serve a whole home: 16 bits of port number gives roughly 64,000 simultaneous conversations, and that conntrack entry is the only place in the universe that remembers who 38112 really is.",
      component: 'netfilter NAT engine (nf_nat_ipv4_manip_pkt) + conntrack tuple store',
      layer: 'Router kernel · OSI L3/L4',
      abstraction: 'A stateful pseudonym service: every outgoing flow gets an alias, and the ledger maps replies back',
      misconception: "You might think NAT only rewrites the IP address — actually when a whole house shares one address it has to manage PORTS as well, or two devices that happened to pick the same source port would collide. And it must fix TWO checksums; middleboxes that forget the TCP pseudo-header make packets vanish for no visible reason.",
      analogy: "A magazine that prints reader letters under one shared address with a file number in the corner, and keeps an index so every reply reaches the person who actually wrote in.",
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
      what: "The cable modem is not allowed to just speak: it has to ask permission first. DOCSIS upstream is shared with the whole neighborhood segment, so the modem sends a bandwidth REQUEST, the CMTS scheduler at the ISP answers with a MAP message granting it specific minislots, and only then does the modem burst our frame upstream as OFDMA symbols on its assigned subcarriers. On fiber a GPON ONT does the moral equivalent: timed bursts of 1310 nm light in windows the OLT hands out. This request-and-grant dance costs 1-5 ms.",
      why: "Hundreds of homes share the same upstream spectrum, and without a central scheduler their bursts would land on top of each other. It is also why home uploads feel worse than downloads: every upstream packet, even a bare TCP acknowledgement, waits for its turn.",
      component: 'DOCSIS 3.1 cable modem + CMTS scheduler (or GPON ONT + OLT)',
      layer: 'Access network · OSI L1/L2',
      abstraction: 'Raising your hand and waiting to be called on before every sentence',
      misconception: "You might think a 20 Mb/s uplink means your packets leave instantly — actually bandwidth is a rate, not a right of way. The grant cycle adds milliseconds of jitter to every upstream burst, which is why video calls stutter on a line whose downloads look perfect.",
      analogy: "A classroom where the teacher holds the only talking stick and tells you which two-second window is yours.",
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
      what: "At the ISP's building the packet takes off its cable-TV costume and becomes an ordinary internet packet again. The CMTS — Cable Modem Termination System — demodulates the OFDMA burst, reassembles the DOCSIS frames, and out comes our IP packet on 100G Ethernet. One CMTS serves a service group of several hundred homes, and from here on everything is carrier-grade: redundant routers, fiber links, real routing protocols.",
      why: "Access technologies like DOCSIS, GPON and DSL exist to squeeze data through cheap, noisy media that were already in the ground. The headend is the border where consumer physics ends and the backbone's clean fiber world begins.",
      component: 'CMTS / OLT at the ISP headend or central office',
      layer: 'ISP access edge · OSI L1-L3',
      abstraction: 'The on-ramp where a gravel driveway meets the highway system',
      misconception: "You might think your ISP is one big router — actually between your modem and the internet sit an access-termination layer, aggregation rings, a metro core and border routers, each with its own ways of failing. \"The ISP is down\" is nearly always just one of those layers.",
      analogy: "The neighborhood mail van tipping its sacks into the regional sorting center: same letters, industrial machinery from here on.",
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
      what: "Now the packet joins the main flow, mixed in with tens of thousands of other people's traffic on one very fat link. This is the first true ISP router hop: a BNG (Broadband Network Gateway) validates your subscriber session, applies whatever shaping policy your plan sets, decrements the TTL to 62 and forwards into the metro core — often pushing on an MPLS label so core routers can switch on a short label instead of doing a full IP lookup.",
      why: "Aggregation is the ISP's business model made physical: thousands of subscribers each sold a gigabit share a few hundred-gigabit links, on the entirely correct bet that they never all burst at the same instant.",
      component: 'BNG / aggregation + core routers (MPLS label-switched paths)',
      layer: 'ISP core · OSI L3 (L2.5 with MPLS)',
      abstraction: 'Tributaries merging into a river - individual drops indistinguishable, flow conserved',
      misconception: "You might think each connection gets its own path through the ISP — actually every flow shares the same fat pipes and only the headers tell them apart. Shaping and QoS, where they exist at all, happen at the subscriber edge, not per-flow in the core.",
      analogy: "Neighborhood streets feeding a highway: your car keeps its license plate, but it shares every lane with everyone else's.",
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
      what: "The border router already knows the way to Cloudflare — other networks told it months ago, and it picked its favorite route. The forwarding entry for 104.18.32.7 was installed by BGP, and the full route database holds several candidates for Cloudflare's prefix 104.18.32.0/20 (autonomous system AS13335): via transit provider A, via transit B, or via direct peering. Best-path selection ran long ago — highest local-preference first, because peering is free and paid transit is not, then shortest AS-path, then MED, then internal cost. Winner here: the settlement-free peering path, AS-path just \"13335\".",
      why: "BGP is the internet's routing protocol and its economics protocol at the same time: local-preference encodes business contracts, not distance. And because Cloudflare announces this same prefix from hundreds of cities, \"best path to 104.18.32.7\" quietly means \"path to the nearest Cloudflare front door\".",
      component: 'BGP border router (FRR/IOS-XR/Junos), RIB → FIB installation',
      layer: 'Inter-domain routing · OSI L3 control plane',
      abstraction: 'A map drawn by 80,000 competing companies, each advertising only the roads it profits from',
      misconception: "You might think the internet routes by shortest distance — actually BGP has no notion of latency or geography whatsoever. It optimizes policy: money first, then how many networks the traffic crosses. A packet can take a measurably slower path simply because that path is cheaper.",
      analogy: "Choosing a shipping company not by which depot is nearest but by which one you have a contract with, and only then by how many transfers the parcel goes through.",
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
      what: "Between cities the packet stops being electricity and becomes light in a glass thread thinner than a hair. It rides as pulses at 1550 nm in a single-mode fiber core about 9 μm across. DWDM packs roughly 96 different wavelengths onto one strand, each carrying 100-400 Gb/s using coherent modulation — phase, amplitude and polarization all carrying data — for tens of terabits per fiber pair. EDFA amplifiers boost the light itself every 80-100 km without ever decoding it. Speed in glass: c/1.468, about 204,000 km/s, or 4.9 μs per kilometer.",
      why: "That 4.9 μs per kilometer is the tyrant of every latency budget: Amsterdam to Frankfurt, around 400 km of routed fiber, costs about 2 ms one way before a single router queue is counted. No amount of protocol tuning has ever beaten geography, which is the whole argument for CDNs and anycast.",
      component: 'DWDM line systems, coherent transponders, EDFA amplifier huts',
      layer: 'Optical transport · OSI L1',
      abstraction: 'A hundred colored rivers of data in one glass thread',
      misconception: "You might think fiber is faster than copper because light beats electrons — actually the propagation speeds are almost identical, about 0.66c against 0.68c. Fiber wins on how far a signal goes before it needs help (100 km rather than 100 m) and on sheer bandwidth, not on velocity.",
      analogy: "A prism run backwards: 96 distinct colors merged into a single beam, traveling together, and split apart again at the far end.",
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
      what: "A backbone router the size of a refrigerator glances at the address and passes the packet on, faster than light crosses the room. Its forwarding ASIC does the lookup in nanoseconds against roughly a million routes held in TCAM, a specialized memory that compares every entry at once. TTL becomes 61. With empty queues, the packet's total time inside the box is single-digit microseconds. The control plane — BGP, running on an ordinary CPU — is nowhere near this path.",
      why: "Separating the slow part (working out routes, milliseconds to minutes) from the fast part (forwarding packets, nanoseconds) is THE architectural idea of modern routers: software decides once, and silicon repeats that decision billions of times a second.",
      component: 'Carrier router line cards (Broadcom Jericho / Cisco Silicon One class ASICs)',
      layer: 'Internet backbone · OSI L3',
      abstraction: 'A decision made once, stamped into hardware, executed blindly at line rate',
      misconception: "You might think routers examine each packet in software — actually backbone forwarding never touches a CPU at all. Only exceptions such as an expired TTL, IP options or control traffic get handed up to the processor, which is why floods crafted to hit that exception path can hurt a router whose ordinary forwarding is perfectly healthy.",
      analogy: "A toll road where the pricing committee meets once a month, while the barrier itself lifts ten million times a day without asking anyone.",
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
      what: "The packet crosses a room where hundreds of networks have all plugged into the same enormous switch. An Internet Exchange Point is physically a giant layer-2 switching fabric in a colocation facility; each member network brings a router port and peers with the others over a shared subnet. Our ISP's border router forwards straight across the fabric to Cloudflare's router. The exchange itself is invisible at layer 3 — no TTL is decremented, because a switch is not a router. Route servers let members swap BGP routes many-to-many instead of setting up a session with every single neighbor.",
      why: "Exchanges exist for money and for milliseconds: handing traffic over a shared fabric is settlement-free and one switch hop away, versus paying a transit provider to carry the same bits the long way round. The biggest ones — AMS-IX, DE-CIX, LINX — move tens of terabits a second at peak.",
      component: 'IXP peering fabric + route servers (e.g. BIRD at major IXPs)',
      layer: 'Inter-network exchange · OSI L2 fabric, L3 peering',
      abstraction: 'A farmers market for packets: every network rents a stall and trades directly',
      misconception: "You might think somebody owns the internet backbone — actually there is no backbone company, just thousands of bilateral and multilateral agreements made physical in rooms like this one. The \"internet\" is precisely this mesh of handshakes.",
      analogy: "Instead of every airline routing you through its own hub, all of them agree to meet at one airport where you simply walk to the next gate.",
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
      what: "One more router, and the packet crosses a border: out of the carriers' world and into Cloudflare's own. The TTL ticks to 60 and it enters AS13335, Cloudflare's autonomous system. Border filters apply on the way in — uRPF checks that the source address could plausibly have arrived from that direction, bogon addresses are dropped, DDoS scrubbing decides where traffic should be steered — and then it is inside the destination network, five hops and about 11 ms after leaving your laptop.",
      why: "Autonomous system boundaries are the internet's real borders: each one is a sovereign routing domain with its own policy. Everything until now was somebody else carrying our packet under a contract; from here, the destination network controls its fate entirely.",
      component: 'Cloudflare edge border router (AS13335 ingress)',
      layer: 'Inter-domain boundary · OSI L3',
      abstraction: 'Crossing from international waters into the destination country’s port authority',
      misconception: "You might think packets take the same road back — actually routing is one-directional. The reply follows whatever path Cloudflare's BGP prefers toward your ISP, frequently nothing like the outbound one, and a traceroute only ever shows YOUR direction.",
      analogy: "A parcel handed over by the last freight carrier at the recipient company's own gatehouse: from here it moves on their trucks, under their rules.",
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
      what: "The packet arrives at a Cloudflare building in Amsterdam — though it could just as easily have arrived at any of three hundred others, because they all answer to the same address. That is the trick: 104.18.32.7 is not one machine. Cloudflare announces 104.18.32.0/20 by BGP from 300+ cities simultaneously, which is what anycast means, and the internet's routing gravity pulled our packet to the topologically nearest one. Someone in Tokyo sending to the same IP lands in Tokyo. Inside the building, ECMP hashes our 4-tuple to one specific server, consistently, so every packet of this connection reaches the same machine.",
      why: "Anycast gives you global load spreading and DDoS dilution with no cleverness required on the client at all: an attack from 100,000 bots splits across hundreds of sites instead of concentrating, and every user gets a nearby front door for free. DNS resolvers like 1.1.1.1 and most root servers run on exactly the same trick.",
      component: 'Cloudflare anycast edge (BGP-announced prefix from every PoP)',
      layer: 'Global routing architecture · OSI L3',
      abstraction: 'One phone number that always rings the nearest office',
      misconception: "You might think an IP address identifies one machine — actually anycast breaks that cleanly: the same prefix, hundreds of locations, and BGP choosing per sender. It works for TCP because routes are stable over the seconds a connection lasts, and because each site pins a given flow to one server.",
      analogy: "Every emergency call reaches \"the\" emergency number, and yet a LOCAL control room always picks up.",
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
      what: "Eleven milliseconds after leaving your laptop, the SYN lands in a program that has been sitting there waiting for it. On the chosen edge server the kernel's tcp_v4_rcv() finds a socket listening on port 443 and reads the SYN: initial sequence number 1128394821, plus the client's opening offer — MSS 1460 (the largest chunk it wants per segment), SACK permitted, window scale 7, timestamps on. To this server the client IS 203.0.113.77:38112; the translated address is the only identity that exists out here, because 192.168.1.23 never traveled past your home router.",
      why: "The SYN is not just a hello, it is a features negotiation: both ends have to agree on segment size and on the modern extensions — window scaling above all, without which TCP can never have more than 64 KB in flight — before a single byte of your request moves.",
      component: 'Edge server TCP stack (net/ipv4/tcp_ipv4.c: tcp_v4_rcv → listening socket)',
      layer: 'Remote server kernel · OSI L4',
      abstraction: 'A formal opening bid listing the dialect features you can speak',
      misconception: "You might think the server can see your private IP somewhere in the packet — actually it appears in no header at all. Only the conntrack table in your home router remembers it, and a server would have to persuade your browser to volunteer it at the application layer.",
      analogy: "A letter that arrives showing only the hotel's street address: the front desk ledger is the sole map back to your room.",
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
      what: "The server has to remember a half-finished conversation — and that memory is exactly what attackers try to fill up. Normally the kernel stores a small connection record (a request_sock in the SYN queue, state SYN_RECV) until the client's final ACK arrives, then promotes it to the accept queue for the application to pick up. A SYN flood fills that queue with fakes. Under pressure Linux switches to syncookies: it encodes the essential state — rough MSS, a timestamp — cryptographically INTO the sequence number of its SYN-ACK and stores nothing at all. A valid final ACK proves the client was real and rebuilds the state from that number.",
      why: "SYN floods were the original volumetric denial-of-service attack, back in 1996. Syncookies turn a memory-exhaustion attack into mere bandwidth noise by keeping nothing until the other side proves it exists — and absorbing those floods for customers is a headline Cloudflare product.",
      component: 'SYN/accept queues (net/ipv4/tcp_input.c, tcp_syncookies)',
      layer: 'Remote server kernel · OSI L4',
      abstraction: 'Instead of writing down every caller, hand each a signed claim ticket and keep no list',
      misconception: "You might think the backlog number you pass to listen() caps how many connections can exist — actually it caps the ACCEPT queue, the fully established ones waiting to be picked up; the SYN queue is a separate thing entirely. A full accept queue silently drops the ACKs that would complete handshakes, a notorious cause of mystery timeouts on overloaded services.",
      analogy: "A parking garage that throws away its list of license plates and issues a forgery-proof ticket instead: whatever you hand back at the barrier proves what you paid, so the barrier itself needs no memory.",
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
      explain: "ACK numbers are cumulative - they say \"the next byte I expect\". A SYN carries no data but still consumes one sequence number, so acknowledging it means the client's starting number plus one: 1128394822. The server's own randomly chosen starting number, 3892217345, travels in the Seq field."
    },
    explain: {
      what: "The server answers with one message doing two jobs at once: \"got yours\" and \"here is mine\". The SYN flag carries its own initial sequence number, 3892217345, chosen independently and hashed the RFC 6528 way so nobody can predict it. The ACK field carries 1128394822, meaning your SYN arrived and consumed exactly one sequence number. It attaches its own options too: MSS 1460, SACK permitted, window scale 10. Two of the three handshake legs now exist.",
      why: "The two directions of a TCP connection are independent byte streams, so each side picks and announces where its own counting starts. Randomizing those starting numbers also stops an attacker who cannot see the connection from blindly injecting bytes into it.",
      component: 'Server TCP output (tcp_v4_send_synack → tcp_make_synack)',
      layer: 'Remote server kernel · OSI L4',
      abstraction: 'Two ratchets initialized: each side numbers its own bytes, each acknowledges the other’s',
      misconception: "You might think sequence numbers start at 0 — actually that is just Wireshark being kind and showing you relative numbers. Real initial sequence numbers are randomized 32-bit values, and predictable ones are what made the famous spoofing attacks of the Mitnick era possible.",
      analogy: "Two accountants opening their ledgers at secret random page numbers, each confirming the other's starting page before writing a single entry.",
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
      what: "Now watch the whole journey run backwards in one breath. The SYN-ACK leaves Cloudflare, rides carrier fiber along whatever path BGP prefers in that direction (likely not the one we came by), sheds TTL at every hop from 64 down to 57, waits for a DOCSIS downstream slot, and reaches the home router — where conntrack recognizes the reply 104.18.32.7:443 to 203.0.113.77:38112 and rewrites the DESTINATION back to 192.168.1.23:51324. The [UNREPLIED] flag clears and the mapping is confirmed in both directions. A brand new Ethernet frame carries it the last few meters to the laptop's MAC.",
      why: "This is NAT's second half: the note written on the way out is read on the way back in. No entry means no delivery, which is exactly why unsolicited connections from outside die at this router and why anything you host at home needs port forwarding.",
      component: 'netfilter PREROUTING de-NAT (conntrack reply-direction rewrite)',
      layer: 'Whole path · L1-L4 in reverse',
      abstraction: 'The concierge reading the tracking code on a reply letter and walking it to the right room',
      misconception: "You might think replies retrace your packet's exact route — actually only the NAT rewrite is guaranteed symmetric, because it happens in the same box. The internet path back is whatever Cloudflare's and the carriers' policies prefer, and forward and reverse routes differ constantly.",
      analogy: "A homing pigeon that flies back over a completely different valley, and still has to land on the one loft where its ring number is recorded.",
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
      what: "Back on the laptop the network card taps the CPU on the shoulder, and then lets it finish what it was doing. The card DMA-writes the SYN-ACK into an RX ring buffer and raises a hardware interrupt; the interrupt handler does almost nothing — it schedules the NET_RX softirq and gets out of the way. The softirq's NAPI poll loop then harvests the ring, and the packet climbs ip_rcv() to tcp_v4_rcv() and into our socket. That is the ten-second tour; chapter 23 walks this receive path properly when the HTTP response comes home.",
      why: "Interrupt handlers freeze whatever that CPU was doing, so they have to be tiny. Linux splits receiving into a minimal top half that only says \"there is work\" and a batched bottom half that actually does it.",
      component: 'NIC RX ring → hardirq → NET_RX_SOFTIRQ → NAPI poll (net/core/dev.c)',
      layer: 'Client kernel · L1→L4 ascent',
      abstraction: 'A doorbell wakes the house; the actual unpacking happens calmly afterwards in batches',
      misconception: "You might think each packet costs one interrupt — actually under load NAPI switches per-packet interrupts off and polls the ring instead, spreading a single interrupt across dozens of packets. That is why a busy server does not collapse under interrupt storms.",
      analogy: "A kitchen timer pings once to say something is ready. You do not drop the knife mid-chop; you finish the cut, then deal with everything that finished while you worked.",
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
      what: "The laptop checks the answer, decides the connection is real, and fires off the third and final handshake message. tcp_rcv_synsent_state_process() verifies that ack 1128394822 genuinely acknowledges our SYN, records the server's initial sequence number and options, moves the socket from SYN_SENT to ESTABLISHED, and immediately sends leg three: a bare ACK with seq 1128394822 and ack 3892217346, the server's own number plus one. When that lands, the server promotes its half-open record to the accept queue as well, and both byte streams are open for business.",
      why: "Three legs is the smallest number that proves both directions work AND that both sides agree on both starting numbers. Two would leave the server unsure its own number ever arrived.",
      component: 'Client TCP state machine (net/ipv4/tcp_input.c: tcp_rcv_synsent_state_process)',
      layer: 'Client kernel · OSI L4',
      abstraction: 'A two-party contract: offer, counter-offer-with-acceptance, acceptance',
      misconception: "You might think the handshake is slow because it exchanges a lot — actually it carries zero application bytes and costs exactly one round trip. What people feel as a slow connection is usually that round trip happening twice, once for TCP and once for TLS, before any content moves at all.",
      analogy: "\"Can you hear me?\" — \"I hear you, can you hear me?\" — \"I hear you.\" Only now does the meeting actually start.",
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
      what: "TCP just got its first stopwatch reading, and it builds nearly everything else out of that one number. The SYN to SYN-ACK round trip measured about 24 ms, so tcp_rtt_estimator() seeds srtt (smoothed round-trip time) at 24 ms plus a variance figure, giving a retransmission timeout of srtt + 4×rttvar, clamped to no less than 200 ms. Congestion control — CUBIC by default — starts with an initial window of 10 segments (RFC 6928), so the connection may push about 14.6 KB into the network before the first acknowledgement of real data comes back.",
      why: "TCP paces itself off its own echo: retransmission timers, window growth, all of it descends from that measurement. The 10-segment starting allowance, raised from 3 in 2013, exists because most web responses fit inside it — turning three slow-start round trips into none.",
      component: 'RTT estimation + congestion control (tcp_input.c, net/ipv4/tcp_cubic.c)',
      layer: 'Client kernel · OSI L4',
      abstraction: 'A feedback controller calibrating its clock from its own echo',
      misconception: "You might think bandwidth determines page load speed — actually below about 5 Mb/s it does, and above that round-trip time takes over. A handshake-heavy HTTPS request needs two or three round trips before the first byte: 72 ms at 24 ms RTT, but 600 ms on a satellite link with identical bandwidth.",
      analogy: "A brand new delivery route: you time the first run, set your \"assume it is lost\" alarm from that, and send only ten parcels before you stop and wait to hear back.",
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
      what: "The waiting is over: the part of the browser that asked for this connection gets woken up and told it is ready. When the socket went ESTABLISHED, sk_state_change() fired ep_poll_callback, flagging the file descriptor as ready inside the epoll instance. The network service's event loop — Chrome's network thread here, libuv's uv__io_poll in Node — returns from epoll_wait with EPOLLOUT on fd 42, checks that getsockopt(SO_ERROR) is 0, and declares the non-blocking connect() a success. The TCPConnectJob completes and the socket is handed to the next layer, which for an https URL is TLS.",
      why: "Nothing blocked for those 24 milliseconds. The thread went off and did other work and was woken by an event rather than a timer — the pattern every high-concurrency system, from browsers to Node to nginx, is built on.",
      component: 'epoll wakeup path (fs/eventpoll.c: ep_poll_callback) → Chrome net::TCPConnectJob / libuv',
      layer: 'User space · syscall boundary',
      abstraction: 'Registered curiosity: "wake me when THIS becomes writable" - and it did',
      misconception: "You might think a non-blocking connect() returning -1 with EINPROGRESS is an error — actually that is the design: the call starts the handshake and returns instantly, completion arrives later as writability, and SO_ERROR tells success from failure. Code that retries on any error breaks this completely.",
      analogy: "Leaving your car at the garage with your phone number. The call two hours later IS the completion event; you never stood around in the workshop.",
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
        { value: 'https', label: 'https:// — TLS 1.3 handshake', hint: 'One extra round trip buys three things: nobody can read it, nobody can change it, and you know who you are talking to. The handshake picks HTTP/2 while it is at it.' },
        { value: 'http', label: 'http:// — send it in the clear', hint: 'No extra round trip at all - and every device between you and the server can read your request and rewrite it. Browsers label the page Not Secure.' }
      ]
    },
    explain: {
      what: "There is now an open pipe to the server, and one letter in the URL decides whether anything sent down it is readable by strangers. The socket is ESTABLISHED and writable; https means run a TLS handshake before a single HTTP byte, http means write the request bytes straight onto the socket. Same TCP connection, radically different threat model.",
      why: "TLS is not part of TCP — it is a separate negotiation that happens to turn a byte stream into a private one. Seeing it as a layer bolted on top explains both why HTTPS costs an extra round trip and why a handshake can fail while the TCP connection underneath is perfectly healthy.",
      component: 'Connection layer scheme dispatch (Chrome net::SSLConnectJob vs plain HttpStream)',
      layer: 'User space · OSI L5/L6 decision',
      abstraction: 'A transparent byte-stream wrapper that can be inserted, or not',
      misconception: "You might think HTTPS is a different protocol from HTTP — actually it is the same HTTP, written into an encrypted stream. Take the TLS away and the bytes above are essentially unchanged (until HTTP/2 altered the framing, for entirely unrelated reasons).",
      analogy: "The same letter, either dropped in an open tray on the counter or sealed into a tamper-evident diplomatic pouch first.",
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
      what: "With plain http there is no handshake and no negotiation: the request goes onto the wire as readable text. Every byte is legible to anything on the path — the neighbor sniffing the air, the coffee shop router, your ISP, every backbone operator, every transparent proxy. The session cookie and the bearer token sit in plain view, and anyone who copies them can replay them as you.",
      why: "This was the ordinary web until around 2015, and it is why Let's Encrypt, HSTS and browser shaming campaigns all happened: over plaintext HTTP, an authentication token is effectively a public credential on a shared medium.",
      component: 'HTTP/1.1 over raw TCP',
      layer: 'User space · OSI L7',
      abstraction: 'A postcard: readable, and forgeable, by every carrier who touches it',
      misconception: "You might think plaintext is fine because it is only a GET of public data — actually the request still carries your cookies and tokens, and the RESPONSE can be edited on the way back. Confidentiality is only half the point; integrity is what stops injected ads, tracking headers and malware.",
      analogy: "Reading your card PIN out loud on a busy train because you were only checking your balance.",
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
      what: "Plaintext is not just readable — it is writable, and plenty of people have written to it. ISPs have injected data-cap banners and adverts into HTTP responses; hotel and airport portals rewrite pages as a matter of routine; in 2015 the \"Great Cannon\" rewrote a plain-HTTP analytics script in flight and turned millions of browsers into a DDoS weapon. Browsers now mark http:// pages Not Secure, block mixed content, and lock powerful APIs — service workers, geolocation, WebAuthn — behind secure contexts entirely.",
      why: "Integrity is the underrated half of TLS: encryption stops people reading, and the authentication tag is what stops them writing. Without it, the code your users run is whatever the last hop felt like sending.",
      component: 'Transparent proxies, content injectors, captive portals along the path',
      layer: 'Network path · OSI L7 tampering',
      abstraction: 'An unsealed letter that every postal worker may append to',
      misconception: "You might think HTTPS is about hiding secrets — actually it is just as much about knowing that the bytes you received are the bytes the server sent, from the server you meant to reach. Authentication, integrity and confidentiality, roughly in order of how underappreciated they are.",
      analogy: "Sending a contract by open courier and finding an extra clause in it when it arrives.",
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
      what: "The client opens the conversation by saying who it wants, which languages it speaks, and — cheekily — handing over half of a shared secret before anyone asked for it. The ClientHello carries 32 random bytes, its list of cipher suites, supported_versions announcing TLS 1.3, SNI = api.shop.dev so an anycast edge serving millions of domains knows which certificate to present, ALPN offering h2 then http/1.1, and the TLS 1.3 innovation: a key_share, an ephemeral X25519 public key sent speculatively, before the client knows whether the server even likes that group.",
      why: "That speculative key share is precisely why TLS 1.3 costs one round trip instead of two: the client guesses the group right nearly every time, so the server can compute the shared secret and start encrypting in its very first reply.",
      component: 'BoringSSL/OpenSSL client (SSL_do_handshake) inside the network service',
      layer: 'User space · OSI L5/L6',
      abstraction: 'An opening offer that includes your half of the shared secret pre-emptively',
      misconception: "You might think TLS encrypts everything, including which site you are visiting — actually SNI, the hostname, travels in the clear in this first message; Encrypted Client Hello is still rolling out. Anyone on the path sees WHICH site you visit, just not what you do there.",
      analogy: "Walking up to a door and saying, in one breath, who you want to see, which languages you speak, and here is half of a torn banknote to match against yours.",
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
      what: "The server sends back its own half of the secret, and from the very next message everything is encrypted. The edge picks TLS_AES_128_GCM_SHA256 and returns its own ephemeral X25519 public key. Both sides now compute the same 32-byte ECDHE shared secret from their own private key and the other side's public one — a value that is never transmitted. HKDF runs it together with a hash of the conversation so far to derive handshake traffic keys, so everything remaining in the handshake, including the certificate and the agreed ALPN protocol, arrives encrypted inside EncryptedExtensions.",
      why: "Encrypting the rest of the handshake was a deliberate TLS 1.3 privacy upgrade: in TLS 1.2 the server's certificate went out in cleartext, so anyone watching learned exactly which site, and which certificate, you were fetching.",
      component: 'Cloudflare TLS terminator (BoringSSL) at the anycast edge',
      layer: 'Remote edge · OSI L5/L6',
      abstraction: 'Two strangers mixing paint in public and both ending up with the same private color',
      misconception: "You might think the server sends the session key encrypted with its public key — actually that was RSA key transport, removed in TLS 1.3 precisely because it offered no forward secrecy. Modern TLS DERIVES the key at both ends; the key itself never crosses the wire in any form.",
      analogy: "Two cooks each stir a secret spice into identical pots of stock in full view, swap pots, and stir their own spice in again. Both pots now taste the same, and nobody watching could reproduce the flavor.",
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
      what: "The server now proves who it is — with a document, and with a signature made fresh, in front of you. Under handshake encryption it sends its certificate chain: the leaf for api.shop.dev plus the intermediate CA that vouched for it. Then CertificateVerify, a signature made with the private key matching the leaf's public key, over the entire handshake transcript so far. Then Finished, an HMAC proving both sides derived identical keys. The root CA is deliberately not sent, because the client already has it.",
      why: "CertificateVerify is the actual proof of identity. Anyone can copy a public certificate off the internet; only whoever holds the matching private key can sign THIS connection's unique transcript, and that signature is what binds \"this certificate\" to \"this live conversation\".",
      component: 'Cloudflare edge certificate store (SNI-selected, thousands per server)',
      layer: 'Remote edge · OSI L6',
      abstraction: 'A passport (certificate) plus a live signature proving you are its holder',
      misconception: "You might think the server sends the whole chain right up to the root — actually it must not: roots come from your own trust store, so sending one is wasted bytes. A chain MISSING its intermediate is the classic \"works in Chrome, fails on curl and Android\" bug, because browsers quietly fetch and cache intermediates while other clients do not.",
      analogy: "Showing your passport at a counter and then signing a slip on the spot: it is the signature matching the document that proves the passport is yours and not stolen.",
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
        'It is rejected (ERR_CERT_COMMON_NAME_INVALID): no name in the certificate matches the hostname you asked for',
        'The browser prompts to add an exception automatically'
      ],
      answer: 1,
      explain: "Matching the hostname is its own mandatory check, made against the certificate's subjectAltName list - the old Common Name field has been ignored by browsers for years. Wildcards cover exactly one label: *.shop.dev covers api.shop.dev but not a.b.shop.dev, and a certificate for shop.dev alone covers neither."
    },
    explain: {
      what: "Now the client turns skeptic and checks that certificate five different ways before it will trust a single byte. It verifies the leaf's signature using the intermediate's public key, and the intermediate's using a root already in the operating system or browser trust store; it checks notBefore and notAfter on every certificate; it matches the hostname you asked for against subjectAltName, ignoring the old Common Name field entirely; it checks revocation (CRLSets in Chrome, CRLite in Firefox, OCSP stapling where it is offered); and it demands Certificate Transparency proof — at least two signed timestamps from qualified public logs, or Chrome rejects the connection outright.",
      why: "Everything so far rests on this one step: the shared secret proves you are talking privately to SOMEBODY, and only certificate verification proves that somebody is api.shop.dev. Skip it and an attacker in the middle simply offers their own key and reads everything.",
      component: 'Certificate verifier + OS/browser trust store (~150 roots)',
      layer: 'User space · OSI L6 / PKI',
      abstraction: 'Delegated trust: I trust ~150 roots, they vouch for intermediates, which vouch for this leaf',
      misconception: "You might think the padlock means the site is safe — actually it means the connection is private and the NAME matched. Phishing sites get perfectly valid certificates in minutes. The padlock authenticates the domain, never the intentions behind it.",
      analogy: "A pharmacist checking a prescription: is it on a genuine pad, is it in date, is it made out to the person standing here, and has that pad been reported stolen?",
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
      what: "The client sends one last handshake message that says \"here is my summary of everything we just said\" — and then both sides change keys. Finished is an HMAC over the complete handshake transcript, computed with the client's handshake traffic secret. Both sides then derive the application traffic secrets through the key schedule and switch to them. If anything anywhere in the handshake was tampered with — a downgraded cipher list, a stripped extension — the two transcripts hash differently and Finished fails on the spot.",
      why: "Finished is the handshake's own integrity check, protecting retroactively the negotiation that happened before any encryption existed. It is why downgrade attacks do not work against TLS 1.3: you cannot quietly edit messages that both sides will later hash and compare.",
      component: 'TLS state machine transition to application data keys',
      layer: 'User space · OSI L6',
      abstraction: 'Both parties reading back the entire conversation to confirm they heard it identically',
      misconception: "You might think one key protects the whole session — actually there are separate keys for each direction, different keys for the handshake and for application data, and TLS 1.3 can rotate them mid-connection with KeyUpdate. An early-data phase has its own, weaker keys again.",
      analogy: "Ending a negotiation by both sides initialing every page of the minutes: one page that does not match and the whole deal is void.",
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
      what: "Buried in the encrypted part of the server's reply was a single word: h2. HTTP/2 was agreed inside the handshake at a cost of zero extra round trips — no Upgrade dance, no probing. Total TLS cost: ONE round trip, about 24 ms here, because the client's speculative key share let the server encrypt from its very first flight. TLS 1.2 needed two; a resumed TLS 1.3 session using a pre-shared key can even send data at zero.",
      why: "Every round trip you save is 24 ms here and 200 ms or more on mobile. TCP plus TLS 1.3 costs 2 round trips before the first request byte, against 3 for TLS 1.2 — and QUIC folds transport and crypto together to make it 1, which is the entire motivation behind HTTP/3.",
      component: 'ALPN negotiation (RFC 7301) inside the TLS handshake',
      layer: 'Remote edge · OSI L6/L7 boundary',
      abstraction: 'Choosing the language of the meeting while still shaking hands',
      misconception: "You might think HTTP/2 requires TLS by specification — actually it does not; cleartext h2c exists on paper. But no browser implements it, so negotiating inside a TLS handshake is the only way you ever actually get HTTP/2.",
      analogy: "Two pilots agreeing which radio frequency to use during the very first call, instead of trying three channels until somebody answers.",
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
      what: "The keys that protected this connection are thrown away when it closes, and nothing can bring them back. The X25519 private keys used here were generated for this connection alone and live only in memory. The certificate's long-lived private key merely SIGNED the transcript; it never encrypted anything. So an adversary recording this traffic today and stealing the server's private key next year still cannot decrypt it, because the material they would need no longer exists anywhere.",
      why: "Recording traffic now to decrypt it later is a genuine adversary's plan, and forward secrecy makes it impossible one connection at a time — which is why TLS 1.3 removed static-RSA key transport outright rather than merely discouraging it.",
      component: 'Ephemeral ECDHE key generation per connection',
      layer: 'Remote edge · cryptographic design',
      abstraction: 'A one-time pad of key material that is burned after reading',
      misconception: "You might think stealing the server's private key unlocks past traffic — actually that was true for TLS 1.2 with RSA key exchange and is false with ephemeral Diffie-Hellman. What a stolen key still buys an attacker is the ability to IMPERSONATE the server from now on, which is why revocation and short-lived certificates matter.",
      analogy: "A safe whose combination is scrambled to a new random value after every meeting and never written down: turning up a year later with a court order gets you a locked box and nothing else.",
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
      what: "Before asking for anything, the client sends a short nonsense phrase — a deliberate password that only a real HTTP/2 peer survives. It is the literal ASCII string \"PRI * HTTP/2.0\\r\\n\\r\\nSM\\r\\n\\r\\n\", followed by a SETTINGS frame declaring limits: maximum concurrent streams, initial window size, header table size. The server answers with its own SETTINGS and both sides acknowledge. All of it is written inside the TLS stream we just established, never in the clear.",
      why: "The preface is deliberately gibberish to an HTTP/1.1 parser: any legacy proxy that thinks it understands the connection chokes immediately rather than silently mangling binary frames for the next ten minutes. SETTINGS then fixes flow control and concurrency limits before the first request.",
      component: 'HTTP/2 session layer (Chrome net::SpdySession; nghttp2 in Node/nginx)',
      layer: 'User space · OSI L7',
      abstraction: 'A tripwire greeting that only a real HTTP/2 peer can survive',
      misconception: "You might think HTTP/2 is just HTTP/1.1 with compression — actually it is a binary, multiplexed framing protocol with its own flow control, stream priorities and (now deprecated) server push. The MEANINGS — methods, status codes, headers — are unchanged; the wire format is entirely different.",
      analogy: "Starting a phone call with the screech of a fax handshake: anything that is not a fax machine hangs up immediately.",
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
      what: "The request becomes a small binary parcel, and most of its headers shrink to a single byte each. It is a HEADERS frame on stream 1 — client-started streams are always odd-numbered. HTTP/2 replaces the old request line with pseudo-headers, :method, :scheme, :authority and :path, all lowercase and binary-encoded. HPACK compresses them against a 61-entry static table plus a dynamic table both ends keep in lockstep, so \":method GET\" is literally index 2, one byte. END_STREAM is set because a GET has no body.",
      why: "Header bloat was HTTP/1.1's quiet tax: 500-800 bytes of nearly identical headers on every single request, uncompressed, and often bigger than the response itself for small API calls. HPACK's shared table makes repeat requests on the same connection almost free in header bytes.",
      component: 'HPACK encoder + HTTP/2 framing layer',
      layer: 'User space · OSI L7',
      abstraction: 'A shared codebook both ends maintain in lockstep, so common phrases become indices',
      misconception: "You might think HPACK is just gzip for headers — actually it is a stateful index table, not a stream compressor, and that was deliberate: generic compression over data an attacker can influence leaks secrets, as the CRIME and BREACH attacks demonstrated.",
      analogy: "Ordering \"the usual, table four\" instead of reciting the whole menu description every time you walk in.",
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
      what: "The request now gets wrapped, and wrapped, and wrapped again, until nothing on the wire can tell what it is. SSL_write() puts the HEADERS frame inside a TLS record: a small header (type 23, version, length), the AES-128-GCM ciphertext, and a 16-byte authentication tag. That ciphertext is written to fd 42, copied into the socket send buffer, segmented by TCP, given an IP header, framed in Ethernet — and out through the whole stack we spent nine chapters building. On the wire only the TLS record header is legible; everything above it is indistinguishable from noise.",
      why: "This is the payoff of layering: HTTP knows nothing about TCP segments, TCP knows nothing about TLS records, and Ethernet knows nothing about any of it. Each layer adds its own header and hands the parcel down.",
      component: 'TLS record layer → send() → tcp_sendmsg() → ip_queue_xmit() → dev_queue_xmit()',
      layer: 'User→kernel · OSI L7 down to L2',
      abstraction: 'Russian dolls: each layer wraps the one above and addresses only its own peer',
      misconception: "You might think one HTTP request equals one TCP packet — actually a request can span many segments, several small requests can share one segment, and TLS record boundaries line up with neither. Never write a parser that assumes packet boundaries mean anything.",
      analogy: "A letter in an envelope, in a courier pouch, in a mail sack, on a truck: every handler reads only their own label and ignores the rest.",
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
      what: "The encrypted request retraces the entire journey — and this time everything along the way already knows it. Network card, switch, router, conntrack, modem, headend, ISP core, peering, Cloudflare edge: roughly 12 ms one way. What is different from the SYN's trip is that every stateful device recognizes this flow. Conntrack matches an ESTABLISHED entry instead of creating one, the router's hardware offload may forward it without the CPU ever seeing it, and TCP is past the first step of slow start with a larger window.",
      why: "First packets are expensive and later packets are cheap. That asymmetry — setting state up versus reusing it — is why keep-alive and connection pooling pay off so enormously, and why cold connections dominate your tail latency.",
      component: 'The entire egress path, now warm',
      layer: 'Full stack traversal · L7→L1→L7',
      abstraction: 'A path that is only expensive the first time you walk it',
      misconception: "You might think every packet is fully processed by every device — actually established flows take fast paths everywhere: NIC flow steering, conntrack's ESTABLISHED shortcut, hardware NAT offload, ASIC forwarding. Only the first packet of a flow does the full expensive dance.",
      analogy: "The second trip through airport security with a fast-track pass: same building, a tenth of the friction.",
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
      what: "At the Cloudflare edge the request is decrypted — the first time it has existed as readable text anywhere outside your laptop. The edge server's TLS terminator decrypts the record, verifies the GCM authentication tag, and hands the HEADERS frame to Cloudflare's HTTP proxy, the Rust-based Pingora pipeline. From here the request runs a gauntlet of edge logic: DDoS scoring, WAF rules, cache lookup, origin routing.",
      why: "TLS is end-to-end only between whoever holds the keys, and here that is Cloudflare, not your origin server. That is the bargain a CDN offers: you lend it your certificate so it can inspect, cache, filter and optimize.",
      component: 'Cloudflare edge HTTP proxy (Pingora), post-TLS-termination',
      layer: 'Remote edge · OSI L7',
      abstraction: 'The trusted intermediary opens the pouch it was given keys for',
      misconception: "You might think HTTPS means only the origin can read your request — actually it means only the holder of the presented certificate's private key can, and behind a CDN that is the CDN. Truly end-to-end to the origin would require the CDN to be a dumb TCP pipe, giving up every layer-7 feature you bought it for.",
      analogy: "A courier who legitimately holds the key to your diplomatic pouch: entirely intended, and the pouch is nonetheless wide open in their sorting office.",
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
      what: "Before anything reads what you actually asked for, the edge decides whether you look like an attack. This first gate is about shape and volume, not meaning: it scores the connection against per-IP and per-network rate baselines, compares the JA4 TLS fingerprint against the User-Agent it claims to be, weighs how fast requests are arriving, and consults reputation data for 203.0.113.77. A residential ISP address, a fingerprint consistent with a real browser, first request on a fresh connection — benign, no challenge issued, forwarded onward in microseconds.",
      why: "Attack traffic has to die before it costs anything expensive. Cheap statistical filtering, applied early, means a terabit flood is absorbed by silicon while real users pay no measurable latency — and anycast helps enormously, because 100,000 bots land on 300 different sites instead of one.",
      component: 'Cloudflare L3/L4 + L7 DDoS mitigation (XDP/eBPF drop paths, gatebot)',
      layer: 'Remote edge · L3-L7 filtering',
      abstraction: 'A bouncer who judges the crowd’s shape, not each person’s conversation',
      misconception: "You might think DDoS protection means one very big firewall — actually at this scale it is statistical: sampled traffic analysis generates rules that get compiled into eBPF/XDP programs and dropped inside the network card's receive path, at line rate, before the packet ever reaches a socket.",
      analogy: "Stadium turnstiles that count and pace the crowd, rather than interviewing every fan about why they came.",
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
      what: "Now something actually reads the request — and reads it looking for trouble. The WAF evaluates managed rulesets against the URI path, the query string, headers, cookies and, for POSTs, the body: SQL injection patterns (UNION SELECT, tautologies like ' OR 1=1), cross-site scripting payloads (<script, javascript: URIs), path traversal (../../etc/passwd), template-injection and log4shell signatures, plus oddities like duplicate Host headers or the Content-Length and Transfer-Encoding pairings used for request smuggling. limit=20 is a boring integer. Verdict: allow.",
      why: "A WAF buys you time, not immunity: it blocks the SHAPES of known exploits so a vulnerable app is not compromised on the day a CVE drops, before you have had a chance to patch. It is a compensating control, never a replacement for parameterized queries and output encoding.",
      component: 'Cloudflare WAF managed rules + custom rules engine (wirefilter expressions)',
      layer: 'Remote edge · OSI L7',
      abstraction: 'A pattern-matching customs officer inspecting the contents, not just the envelope',
      misconception: "You might think a WAF makes your app secure — actually it pattern-matches, and determined attackers encode, chunk and fragment their way around signatures. Meanwhile false positives block real people: an innocent product description containing the word \"select\" has broken more sites than most WAFs have saved.",
      analogy: "Airport baggage scanning: excellent at spotting the shapes on its list, and blind to anything genuinely new.",
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
      what: "The edge checks whether it already has this answer lying around. It does not — and it should not. It builds a cache key (scheme, host, path and query, plus any configured Vary, cookie or device dimensions) and probes the local NVMe cache tier. Nothing there. By default Cloudflare does not cache API responses at all, only static file types, and this endpoint returns Cache-Control: private, no-store because product availability is per-user and changes constantly. Status: DYNAMIC, a miss. The request has to go to the origin.",
      why: "Getting caching right beats caching hard: serving one customer's basket to another is a catastrophe, while a cache miss is merely a bit slow. Cache-Control: private exists precisely to draw that line between shared caches and your own browser.",
      component: 'Cloudflare edge cache (tiered: local PoP → regional upper tier)',
      layer: 'Remote edge · OSI L7',
      abstraction: 'A key-value store keyed by request identity, guarded by freshness and privacy rules',
      misconception: "You might think CDNs cache everything automatically — actually by default they cache static assets by file extension. Dynamic and API responses need explicit cache rules, and any Set-Cookie or Cache-Control: private/no-store makes an object uncacheable in a shared cache.",
      analogy: "A librarian who checks the shelf, finds nothing, and has to order from the central archive — and who flatly refuses to shelve anything addressed to one particular reader.",
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
        'The TLS connection ENDS at the edge - Cloudflare holds the certificate and private key for api.shop.dev',
        'The origin forwards a decryption key to the edge for each request'
      ],
      answer: 1,
      explain: "TLS is end-to-end between whoever holds the keys. Putting a site behind Cloudflare means handing it custody of the certificate and private key (or using Keyless SSL), so the edge is a completely legitimate endpoint of your TLS connection. It decrypts, inspects, and opens a SEPARATE TLS connection onward to the origin: two connections, two encryptions, one plaintext gap in the middle."
    },
    explain: {
      what: "Worth saying plainly: there is no single sealed tunnel from your browser to the origin server. There are two TLS sessions — browser to edge, and edge to origin — joined by a stretch of plaintext inside Cloudflare's memory. That gap is exactly what makes the WAF, caching, image optimization, Workers and compression possible, because none of them work on ciphertext. The price of that capability is trust.",
      why: "Engineers routinely picture HTTPS reaching the origin untouched, then are baffled when the edge rewrites a header or serves a cached body. Naming the trust boundary out loud prevents a whole family of design and compliance mistakes.",
      component: 'Cloudflare TLS termination + origin-facing TLS initiator',
      layer: 'Remote edge · trust boundary',
      abstraction: 'A split-TLS proxy: two secure legs, one trusted middle',
      misconception: "You might think \"end-to-end encryption\" describes a CDN-fronted HTTPS site — actually it is hop-to-hop encryption with a trusted middleman. Real end-to-end encryption, as in Signal, means the middleman mathematically cannot read the content, which is the exact opposite of what a CDN is for.",
      analogy: "An interpreter in a confidential negotiation: both sides speak securely to the interpreter, and the interpreter understands every word.",
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
      what: "Nothing cached, nothing blocked — so the edge works out where the real server actually lives. The zone's DNS record for api.shop.dev is a proxied A record, and the hidden origin address behind it is 198.51.100.10. The edge picks how to get there — ordinary internet transit, or Argo Smart Routing over Cloudflare's own backbone where that is enabled — and hands the request to the origin-pull subsystem.",
      why: "This indirection is the CDN's core value: the public only ever learns the anycast address, so attackers cannot step around the edge and hit your server directly — provided the origin firewall really does restrict inbound traffic to Cloudflare, which is the step teams forget.",
      component: 'Cloudflare origin resolution + Argo Smart Routing',
      layer: 'Remote edge · L7 routing',
      abstraction: 'A dispatcher choosing both the destination and the road to it',
      misconception: "You might think being behind a CDN hides your origin — actually it only does if you lock the origin down. Old DNS records, certificate transparency logs, mail server addresses and Shodan scans leak origin IPs constantly. Allow inbound 443 ONLY from Cloudflare ranges, or use a Tunnel.",
      analogy: "A PO box: the world sees the box number and only the postal service knows the house — as long as the house does not print its own address on the outgoing mail.",
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
      what: "The edge does not pass your packets along. It makes its own separate request, usually over a connection it opened before you even arrived. The source is a Cloudflare egress address, the destination 198.51.100.10:443 — a fresh 4-tuple, a separate TCP state machine, a separate TLS session. Crucially it is normally POOLED: the edge keeps warm keep-alive connections to each origin, so this request skips both handshakes entirely and saves about two round trips, roughly 80 ms if the origin is across an ocean.",
      why: "Connection pooling at the edge is one of the largest and least visible CDN wins: even for traffic that is 100% uncacheable, spreading TCP and TLS setup across thousands of requests takes handshake latency out of every user's critical path.",
      component: 'Cloudflare origin connection pool (HTTP keep-alive / HTTP/2 to origin)',
      layer: 'Remote edge → origin · L4/L7',
      abstraction: 'A proxy is two connections wearing one trench coat',
      misconception: "You might think the proxy forwards your TCP connection — actually it terminates yours and originates its own. Your sequence numbers, your TLS session and your source IP all stop at the edge, and the origin sees Cloudflare as the client — which is exactly why a header like CF-Connecting-IP has to exist.",
      analogy: "A shop assistant who does not put you through to the warehouse, but calls them on the internal line they keep open all day.",
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
      what: "Because the origin will only ever see Cloudflare's address as the caller, the edge writes the truth into the request itself. CF-Connecting-IP carries the real client address, 203.0.113.77 — the NATed public one, never the private 192.168.1.23. X-Forwarded-For repeats it, X-Forwarded-Proto records that the user's leg was https, CF-IPCountry says NL, and CF-Ray is a unique request ID whose suffix, AMS, names the PoP that handled it. That Ray ID is the join key between Cloudflare's logs and your application's.",
      why: "Every rate limiter, audit log, geo rule and abuse block downstream depends on knowing who the real client was. Without these headers a proxied app sees 100% of its traffic arriving from a handful of edge addresses, and every IP-based decision quietly turns into nonsense.",
      component: 'Cloudflare header injection (edge → origin request rewriting)',
      layer: 'Remote edge · OSI L7',
      abstraction: 'Out-of-band provenance metadata added by a trusted forwarder',
      misconception: "You might think you can trust X-Forwarded-For — actually the client can set it themselves, so it means nothing unless your proxy overwrites it and you only accept it from upstreams you trust. Behind Cloudflare, prefer CF-Connecting-IP AND restrict inbound traffic to Cloudflare ranges; otherwise anyone can forge their apparent IP.",
      analogy: "A transfer note that travels with a patient between hospitals: where they came from, when they arrived, and a case number both sides can quote.",
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
      what: "On that pooled connection the request is encrypted all over again, this time with a completely different set of keys. In Full (strict) mode the edge validated the origin's certificate when the connection was first created — typically a Cloudflare Origin CA certificate (free, long-lived, and trusted only by Cloudflare) or an ordinary public one. If Authenticated Origin Pulls is switched on, the edge also presents a CLIENT certificate, so the origin can cryptographically verify the request really came from Cloudflare and refuse everything else.",
      why: "Without this leg, the CDN-to-origin hop would cross the public internet in cleartext — the gaping hole that Cloudflare's old \"Flexible\" mode left open on countless sites for years. And without mutual TLS, anyone who discovers your origin address can impersonate the CDN.",
      component: 'Origin-facing TLS (Full strict + optional mTLS client cert)',
      layer: 'Edge → origin · OSI L6',
      abstraction: 'A second sealed pouch for the second leg of the relay',
      misconception: "You might think Flexible SSL is fine because the browser still shows a padlock — actually the padlock covers only browser to edge; edge to origin is cleartext across the open internet. It is security theater, and every audit flags it.",
      analogy: "A courier who reseals the documents into a fresh pouch, with a different key, for the second half of the trip.",
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
      what: "The real server may be a city or a continent away from the Cloudflare building that took your request, and that trip still has to be made. The packet crosses either the public internet — transit and peering, the same BGP economics as before — or, with Argo Smart Routing, Cloudflare's private backbone, which uses live latency telemetry to dodge congested public paths. Budget: anything from 2 ms within one metro to 80 ms from an Amsterdam edge to a Virginia origin.",
      why: "For anything that cannot be cached, this hop is the part of the latency budget the CDN simply cannot remove — which is exactly why teams push logic out to edge compute or replicate their data regionally.",
      component: 'Public transit / peering, or Cloudflare Argo private backbone',
      layer: 'Internet · OSI L3',
      abstraction: 'The CDN’s own outbound journey, subject to the same physics as yours',
      misconception: "You might think a CDN makes everything fast — actually it makes cacheable things fast and shortens the client's handshake. A cache miss still pays this edge-to-origin round trip on top, and a badly placed origin can make CDN-fronted dynamic requests slower than going direct.",
      analogy: "A restaurant whose front of house is next door to you and whose kitchen is across town: greeting you takes a second, feeding you does not.",
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
      what: "198.51.100.10 is not a server — it is one shared address in front of a rack of them, and something has to choose which one. An L4 load balancer (IPVS, or a cloud network load balancer) picks a backend by consistent hashing on the 4-tuple, or by fewest active connections, and forwards it on by DSR or NAT. Consistency matters enormously here: every packet of this TCP connection MUST reach the same backend, because no other machine holds its TCP state — send one packet elsewhere and the connection dies instantly with an RST.",
      why: "Layer-4 balancing is cheap and blindingly fast, millions of packets a second, precisely because it never parses HTTP. Consistent hashing means adding or removing a backend reshuffles only one flow in N instead of breaking everything — the same trick memcached and distributed hash tables use.",
      component: 'L4 load balancer (IPVS/LVS, Maglev-style hashing, or cloud NLB)',
      layer: 'Origin datacenter · OSI L4',
      abstraction: 'A deterministic hash function pretending to be a single server',
      misconception: "You might think load balancers distribute load evenly — actually they distribute CONNECTIONS, by hash or by count, which is not the same thing at all. One connection can carry a thousand expensive requests, and neither hashing nor least-connections has any idea what a request costs.",
      analogy: "A bowling alley where your ticket fixes which lane you use all evening: switch lanes and your score sheet means nothing.",
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
      what: "A real server finally accepts the connection, unwraps the second layer of encryption, and reads the request as text. nginx on backend 10.0.2.31 terminates TLS session #2 and parses the HTTP request; a server block matching api.shop.dev routes it to a location with proxy_pass. nginx appends the upstream address to X-Forwarded-For, preserves the original Host header, sets X-Real-IP from CF-Connecting-IP — and, importantly, does NOT re-encrypt, because the next hop is inside the datacenter.",
      why: "A reverse proxy earns its keep by doing what application servers do badly: terminating TLS at scale, serving static files, buffering requests so slow clients cannot tie up workers, rate limiting, and routing many upstreams cleanly onto one port 443.",
      component: 'nginx reverse proxy (ngx_http_proxy_module)',
      layer: 'Origin server · OSI L7',
      abstraction: 'A traffic director that speaks the internet outside and simple HTTP inside',
      misconception: "You might think nginx forwards the request unchanged — actually it rewrites hop-by-hop headers, may buffer the entire body, normalizes the path, and by default talks HTTP/1.1 upstream even when you arrived over HTTP/2. Getting Host or X-Forwarded-Proto wrong here causes the classic redirect loop behind a proxy and wrong absolute URLs.",
      analogy: "A building receptionist who signs for every delivery, checks the ID at the door, and walks each parcel to the right internal office.",
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
      what: "This is where the last envelope comes off: from nginx onward, everything travels as plain readable text. TLS session #2 ends here, and the request continues across the Docker bridge, into the container, through NestJS and down to PostgreSQL as plain HTTP over loopback and private datacenter networks. That is a deliberate trade: encrypting between two processes on the same host costs CPU to defend against an attacker who, if they were already there, would have won anyway.",
      why: "Knowing exactly where plaintext exists is a genuine security architecture skill: browser memory, Cloudflare edge memory, this proxy's memory, and everything inside the datacenter perimeter. Compliance regimes and zero-trust designs push encryption further inward precisely because perimeters get breached.",
      component: 'nginx TLS termination boundary → cleartext upstream',
      layer: 'Origin server · trust boundary',
      abstraction: 'The last envelope comes off; from here it is an internal memo',
      misconception: "You might think internal traffic does not need encryption — actually that is classic perimeter thinking. Zero-trust assumes the network is already hostile and encrypts service to service anyway, with a service mesh or WireGuard between hosts. Whether you need it is a threat-model decision, not a default.",
      analogy: "A letter opened at the sorting office and then passed around the newsroom as loose pages: inside the building, nobody bothers with envelopes.",
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
      what: "The proxy carries the request the last few centimeters, to a program listening on port 3000 on the same machine. nginx opens — or reuses from its upstream keep-alive pool — a connection to 127.0.0.1:3000 and writes a plain HTTP/1.1 request. Because the container publishes that port, this actually lands in a DNAT rule that rewrites the destination to 172.17.0.2:3000 inside the Docker bridge network, the subject of the very next chapter. Note the downgrade too: HTTP/2 outside, HTTP/1.1 upstream, because multiplexing buys nothing over a 0.1 ms loopback link.",
      why: "This handoff is the seam between infrastructure and application: everything before it was moving bytes, everything after it is business logic. It is also where most 502s are born — upstream refused, upstream timed out, upstream sent an invalid header.",
      component: 'nginx upstream connection (proxy_pass to 127.0.0.1:3000)',
      layer: 'Origin server · OSI L7',
      abstraction: 'The reception desk finally walking the request to the person who does the work',
      misconception: "You might think nginx and the app are one system — actually they are separate processes with separate lifecycles. A 502 means nginx could not talk to the app at all; a 504 means the app did not answer in time. Reading that difference correctly saves hours per incident.",
      analogy: "A conveyor belt that ends at a workbench: the belt has carried the part all the way here, and from this point a person picks it up and does something with it.",
      protocol: 'HTTP/1.1 keep-alive to upstream (RFC 9112)',
      command: 'curl -s localhost:3000/products?limit=20 | head   # bypass the proxy entirely\njournalctl -u nginx -f | grep -E "upstream|502|504"',
      production: 'Set upstream keepalive (keepalive 64; + proxy_http_version 1.1; + proxy_set_header Connection "";) or nginx opens a fresh TCP connection per request to the app - a measurable throughput loss and a source of TIME_WAIT exhaustion under load.'
    },
    code: [
      { title: 'Upstream keepalive done right', lang: 'bash', code: 'upstream app {\n    server 127.0.0.1:3000;\n    keepalive 64;               # persistent connections to the app\n    keepalive_requests 1000;\n    keepalive_timeout 60s;\n}\n\nlocation / {\n    proxy_pass http://app;\n    proxy_http_version 1.1;     # required for keepalive\n    proxy_set_header Connection "";   # strip "close"\n}' }
    ]
  }

];
