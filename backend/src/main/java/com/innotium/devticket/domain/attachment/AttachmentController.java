package com.innotium.devticket.domain.attachment;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.net.MalformedURLException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.Map;
import java.util.UUID;

/**
 * 첨부파일 업로드 / 다운로드 컨트롤러.
 *
 * POST /v1/attachments          — 파일 업로드, 저장된 파일명 반환
 * GET  /v1/attachments/{filename} — 파일 다운로드 (인증 필요)
 */
@Slf4j
@RestController
@RequestMapping("/v1/attachments")
public class AttachmentController {

    @Value("${app.upload.dir:/app/uploads}")
    private String uploadDir;

    /**
     * 파일 업로드.
     * 최대 20MB, 모든 파일 형식 허용.
     * 저장 파일명: {uuid}_{원본파일명} (공백→언더스코어)
     *
     * @return { "filename": "저장된파일명", "originalName": "원본파일명", "size": 바이트수 }
     */
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Map<String, Object>> upload(@RequestParam("file") MultipartFile file) throws IOException {
        if (file.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "파일이 비어있습니다"));
        }

        String originalName = file.getOriginalFilename() != null
                ? file.getOriginalFilename().replaceAll("[^a-zA-Z0-9가-힣._-]", "_")
                : "attachment";
        String storedName = UUID.randomUUID().toString().replace("-", "") + "_" + originalName;

        Path dir = Paths.get(uploadDir);
        Files.createDirectories(dir);
        Files.copy(file.getInputStream(), dir.resolve(storedName), StandardCopyOption.REPLACE_EXISTING);

        log.info("[ATTACHMENT] Uploaded: {} → {}", originalName, storedName);

        return ResponseEntity.ok(Map.of(
                "filename",     storedName,
                "originalName", file.getOriginalFilename() != null ? file.getOriginalFilename() : originalName,
                "size",         file.getSize()
        ));
    }

    /**
     * 파일 다운로드 / 미리보기.
     * 이미지(jpg/png/gif/webp)는 inline 으로, 그 외는 attachment 으로 반환.
     */
    @GetMapping("/{filename:.+}")
    public ResponseEntity<Resource> download(@PathVariable String filename) throws MalformedURLException {
        Path filePath = Paths.get(uploadDir).resolve(filename).normalize();
        Resource resource = new UrlResource(filePath.toUri());

        if (!resource.exists() || !resource.isReadable()) {
            return ResponseEntity.notFound().build();
        }

        String contentType = "application/octet-stream";
        try { contentType = Files.probeContentType(filePath); } catch (IOException ignored) {}
        if (contentType == null) contentType = "application/octet-stream";

        boolean inline = contentType.startsWith("image/") || contentType.equals("application/pdf");
        String disposition = inline ? "inline" : "attachment; filename=\"" + filename.replaceFirst("^[a-f0-9]{32}_", "") + "\"";

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition)
                .contentType(MediaType.parseMediaType(contentType))
                .body(resource);
    }
}
