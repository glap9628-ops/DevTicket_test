package com.innotium.devticket.domain.comment.service;

import com.innotium.devticket.common.auth.CurrentUser;
import com.innotium.devticket.common.exception.FailException;
import com.innotium.devticket.domain.comment.dto.CommentReq;
import com.innotium.devticket.domain.comment.dto.CommentRes;
import com.innotium.devticket.domain.comment.model.Comment;
import com.innotium.devticket.domain.comment.repository.CommentRepository;
import com.innotium.devticket.domain.mention.service.MentionService;
import com.innotium.devticket.domain.notification.service.NotificationService;
import com.innotium.devticket.domain.ticket.model.Ticket;
import com.innotium.devticket.domain.ticket.repository.TicketRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;

@Service
@RequiredArgsConstructor
public class CommentService {

    private final CommentRepository commentRepository;
    private final TicketRepository ticketRepository;
    private final MentionService mentionService;
    private final NotificationService notificationService;

    @Transactional(readOnly = true)
    public List<CommentRes> getComments(Long ticketId) {
        return commentRepository.findByTicketId(ticketId);
    }

    @Transactional
    public CommentRes addComment(Long ticketId, CommentReq req, CurrentUser user) {
        if (req.getContent() == null || req.getContent().isBlank()) {
            throw new FailException("댓글 내용을 입력해주세요.");
        }

        Ticket ticket = ticketRepository.selectById(ticketId);
        if (ticket == null) {
            throw new FailException(HttpStatus.NOT_FOUND, "티켓을 찾을 수 없습니다.");
        }

        Comment comment = new Comment();
        comment.setTicketId(ticketId);
        comment.setAuthorId(Math.toIntExact(user.getId()));
        comment.setContent(req.getContent().trim());
        commentRepository.insert(comment);

        // 멘션 파싱 → 멘션된 사용자에게 알림 + auto_mention 워처 등록
        List<Long> mentionedUserIds = mentionService.parseMentions(
                ticketId, "comment", comment.getId(), req.getContent(), user.getId());

        // 멘션 알림
        for (Long mentionedId : mentionedUserIds) {
            notificationService.notify(mentionedId, user.getId(), ticketId,
                    "MENTIONED",
                    user.getDisplayName() + "님이 티켓 #" + ticketId + " 댓글에서 멘션했습니다.");
        }

        // 댓글 알림: 요청자 + 담당자 (멘션 수신자 중복 허용)
        List<Long> commentTargets = new ArrayList<>();
        commentTargets.add(ticket.getRequesterId());
        if (ticket.getAssigneeId() != null) commentTargets.add(ticket.getAssigneeId());

        notificationService.notifyMultiple(commentTargets, user.getId(), ticketId,
                "COMMENTED",
                user.getDisplayName() + "님이 티켓 #" + ticketId + "에 댓글을 남겼습니다.");

        return commentRepository.findById(comment.getId());
    }

    @Transactional
    public CommentRes updateComment(Long ticketId, Long commentId, CommentReq req, CurrentUser user) {
        if (req.getContent() == null || req.getContent().isBlank()) {
            throw new FailException("댓글 내용을 입력해주세요.");
        }
        CommentRes existing = commentRepository.findById(commentId);
        if (existing == null || !existing.getTicketId().equals(ticketId)) {
            throw new FailException(HttpStatus.NOT_FOUND, "댓글을 찾을 수 없습니다.");
        }
        boolean isAuthor = existing.getAuthorId().equals(Math.toIntExact(user.getId()));
        boolean isAdmin  = "ADMIN".equals(user.getRole());
        if (!isAuthor && !isAdmin) {
            throw new FailException(HttpStatus.FORBIDDEN, "작성자 또는 관리자만 수정할 수 있습니다.");
        }
        if (isAdmin && !isAuthor) {
            commentRepository.updateById(commentId, req.getContent().trim());
        } else {
            commentRepository.update(commentId, Math.toIntExact(user.getId()), req.getContent().trim());
        }
        return commentRepository.findById(commentId);
    }

    @Transactional
    public void deleteComment(Long ticketId, Long commentId, CurrentUser user) {
        CommentRes existing = commentRepository.findById(commentId);
        if (existing == null || !existing.getTicketId().equals(ticketId)) {
            throw new FailException(HttpStatus.NOT_FOUND, "댓글을 찾을 수 없습니다.");
        }
        boolean isAuthor = existing.getAuthorId().equals(Math.toIntExact(user.getId()));
        boolean isAdmin  = "ADMIN".equals(user.getRole());
        if (!isAuthor && !isAdmin) {
            throw new FailException(HttpStatus.FORBIDDEN, "작성자 또는 관리자만 삭제할 수 있습니다.");
        }
        if (isAdmin) {
            commentRepository.deleteById(commentId);
        } else {
            commentRepository.delete(commentId, Math.toIntExact(user.getId()));
        }
    }
}
