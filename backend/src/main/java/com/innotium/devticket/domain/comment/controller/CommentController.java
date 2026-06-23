package com.innotium.devticket.domain.comment.controller;

import com.innotium.devticket.common.auth.CurrentUser;
import com.innotium.devticket.common.auth.UserContextHolder;
import com.innotium.devticket.common.response.ApiResponse;
import com.innotium.devticket.domain.comment.dto.CommentReq;
import com.innotium.devticket.domain.comment.dto.CommentRes;
import com.innotium.devticket.domain.comment.service.CommentService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/tickets/{ticketId}/comments")
@RequiredArgsConstructor
public class CommentController {

    private final CommentService commentService;

    @GetMapping
    public ApiResponse<List<CommentRes>> getComments(@PathVariable Long ticketId) {
        return ApiResponse.ok(commentService.getComments(ticketId));
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<CommentRes> addComment(@PathVariable Long ticketId,
                                              @RequestBody CommentReq req) {
        CurrentUser user = UserContextHolder.get();
        return ApiResponse.ok(commentService.addComment(ticketId, req, user));
    }

    @PutMapping("/{commentId}")
    public ApiResponse<CommentRes> updateComment(@PathVariable Long ticketId,
                                                 @PathVariable Long commentId,
                                                 @RequestBody CommentReq req) {
        CurrentUser user = UserContextHolder.get();
        return ApiResponse.ok(commentService.updateComment(ticketId, commentId, req, user));
    }

    @DeleteMapping("/{commentId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteComment(@PathVariable Long ticketId,
                              @PathVariable Long commentId) {
        CurrentUser user = UserContextHolder.get();
        commentService.deleteComment(ticketId, commentId, user);
    }
}
