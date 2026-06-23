package com.innotium.devticket.domain.mention.service;

import com.innotium.devticket.domain.mention.repository.MentionRepository;
import com.innotium.devticket.domain.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
public class MentionService {

    private static final Pattern MENTION_PATTERN = Pattern.compile("@([a-zA-Z0-9._-]+)");

    private final MentionRepository mentionRepository;
    private final UserRepository userRepository;

    /**
     * 텍스트에서 @username 파싱 → 멘션 저장 + 워처 자동 등록
     */
    @Transactional
    public List<Long> parseMentions(Long ticketId, String sourceType, Long sourceId,
                                    String text, Long mentionedBy) {
        if (text == null || text.isBlank()) return List.of();

        Matcher matcher = MENTION_PATTERN.matcher(text);
        Set<String> usernames = new LinkedHashSet<>();
        while (matcher.find()) {
            usernames.add(matcher.group(1));
        }

        List<Long> mentionedUserIds = new ArrayList<>();
        for (String username : usernames) {
            Long userId = userRepository.findActiveIdByUsername(username);
            if (userId == null) continue;

            mentionRepository.insertMention(ticketId, sourceType, sourceId, userId, mentionedBy);
            mentionedUserIds.add(userId);
        }
        return mentionedUserIds;
    }

    /**
     * 수정 시: 기존 멘션 삭제 후 재파싱
     */
    @Transactional
    public List<Long> reParseMentions(Long ticketId, String sourceType, Long sourceId,
                                      String text, Long mentionedBy) {
        mentionRepository.deleteBySource(ticketId, sourceType, sourceId);
        return parseMentions(ticketId, sourceType, sourceId, text, mentionedBy);
    }
}
